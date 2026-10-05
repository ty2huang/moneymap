import { createAdminClient } from "@supabase/server/core";
import { DomainError } from "@/domain/types";
import type { Principal } from "./auth";
import { boundedFetch } from "./fetch";

export type DatabaseOperation =
  | "resolve_token"
  | "session"
  | "snapshot"
  | "save_ledger"
  | "create_household"
  | "join"
  | "household"
  | "household_action"
  | "connections"
  | "connection_action"
  | "oauth_begin"
  | "oauth_renew"
  | "oauth_end"
  | "oauth_grant";

/** Every operation is one HTTPS request and one PostgreSQL transaction. */
export async function databaseRpc<T>(
  principal: Principal | undefined,
  operation: DatabaseOperation,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not configured.");
  const client = createAdminClient({
    env: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      secretKeys: {
        default: secretKey,
      },
    },
    supabaseOptions: { global: { fetch: boundedFetch() } },
  });
  const { data, error } = await client.rpc("moneymap", {
    operation,
    payload: {
      ...payload,
      // Identity comes from authenticate(), never from a request body.
      user_id: principal?.userId,
      actor_client_id: principal?.clientId,
      token_hash: principal?.tokenHash ?? payload.token_hash,
    },
  });
  if (error) {
    // Only deliberate application errors are safe to show to callers.
    if (
      error.code === "P0001" &&
      [
        "INVALID",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NO_HOUSEHOLD",
        "CONFLICT",
        "REVISION_CONFLICT",
        "OAUTH_BUSY",
      ].includes(error.details)
    ) {
      const code = error.details;
      const status =
        code === "UNAUTHORIZED"
          ? 401
          : code === "FORBIDDEN" || code === "NO_HOUSEHOLD"
            ? 403
            : ["CONFLICT", "REVISION_CONFLICT", "OAUTH_BUSY"].includes(code)
              ? 409
              : 400;
      throw new DomainError(code, error.message, status);
    }
    throw error;
  }
  return data as T;
}

export type OAuthLease = {
  leaseId: string;
  householdId: string | null;
  activeClientIds: string[];
};

export type ActiveOAuthLease = OAuthLease & { signal: AbortSignal };

/** A bounded database lease serializes provider calls across server instances. */
export async function withOAuthLease<T>(
  principal: Principal,
  work: (lease: ActiveOAuthLease) => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + 15_000;
  let lease: OAuthLease;
  for (;;) {
    try {
      lease = await databaseRpc<OAuthLease>(principal, "oauth_begin");
      break;
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== "OAUTH_BUSY" ||
        Date.now() >= deadline
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const controller = new AbortController();
  let stopped = false;
  let renewalError: unknown;
  let pendingRenewal = Promise.resolve();
  let timer: ReturnType<typeof setTimeout>;
  const renew = () => {
    pendingRenewal = (async () => {
      try {
        await databaseRpc(principal, "oauth_renew", {
          lease_id: lease.leaseId,
        });
      } catch (error) {
        renewalError = error;
        controller.abort(error);
      }
      if (!stopped && !controller.signal.aborted)
        timer = setTimeout(renew, 20_000);
    })();
  };
  timer = setTimeout(renew, 20_000);
  try {
    const result = await work({ ...lease, signal: controller.signal });
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    throw renewalError ?? error;
  } finally {
    stopped = true;
    clearTimeout(timer);
    await pendingRenewal;
    // Expiry releases the lease if cleanup fails; preserve the work's outcome.
    await databaseRpc(principal, "oauth_end", {
      lease_id: lease.leaseId,
    }).catch((error) => console.error("OAuth lease release failed", error));
  }
}
