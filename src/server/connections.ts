import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { grants, tokens } from "@/db/schema";
import { ensure } from "@/domain/types";
import { hash } from "./crypto";
import { firstParty, type Principal } from "./auth";
import { supabaseServer } from "./supabase";
import { databaseRpc, withOAuthLease } from "./database";

type Connections = {
  tokens: Omit<typeof tokens.$inferSelect, "hash">[];
  grants: (typeof grants.$inferSelect)[];
};

export async function authorizationDetails(
  principal: Principal,
  authorizationId: string,
) {
  firstParty(principal);
  return withOAuthLease(principal, async (lease) => {
    const activeClients = new Set(lease.activeClientIds);
    const client = await supabaseServer(lease.signal);
    const { data: grants, error } = await client.auth.oauth.listGrants();
    ensure(
      !error && grants,
      "Application access could not be checked. Please try again.",
    );
    for (const grant of grants) {
      if (activeClients.has(grant.client.id)) continue;
      const result = await client.auth.oauth.revokeGrant({
        clientId: grant.client.id,
      });
      ensure(
        !result.error,
        "Application access could not be reset. Please try again.",
      );
    }
    return client.auth.oauth.getAuthorizationDetails(authorizationId);
  });
}

export async function connections(principal: Principal) {
  firstParty(principal);
  const result = await databaseRpc<Connections>(principal, "connections");
  const client = await supabaseServer();
  const { data: oauthGrants } = await client.auth.oauth.listGrants();
  const applications = new Map(
    (oauthGrants ?? []).map((grant) => [grant.client.id, grant]),
  );
  return {
    ...result,
    grants: result.grants.map((grant) => ({
      ...grant,
      application: applications.get(grant.clientId) ?? null,
    })),
  };
}

export async function connectionAction(principal: Principal, input: unknown) {
  firstParty(principal);
  const action = z
    .object({
      action: z.enum(["create-token", "revoke-token", "revoke-grant"]),
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(80).optional(),
      permission: z.enum(["read", "write"]).default("read"),
      days: z.number().int().min(1).max(365).default(30),
    })
    .parse(input);
  if (action.action === "create-token") {
    ensure(action.name, "Name the token.");
    const token = "mm_" + randomBytes(32).toString("base64url");
    await databaseRpc(principal, "connection_action", {
      ...action,
      id: crypto.randomUUID(),
      hash: hash(token),
      expires_at: new Date(Date.now() + action.days * 86400000).toISOString(),
    });
    return { token };
  }
  ensure(action.id, "Select a connection.");
  if (action.action === "revoke-token")
    return databaseRpc<{ ok: true }>(principal, "connection_action", action);
  return withOAuthLease(principal, async (lease) => {
    // Local revocation commits before contacting the provider. The lease prevents
    // a concurrent approval from being undone by this provider revocation.
    const result = await databaseRpc<{ ok: true; clientId: string | null }>(
      principal,
      "connection_action",
      { ...action, lease_id: lease.leaseId },
    );
    if (result.clientId) {
      const client = await supabaseServer(lease.signal);
      const { error } = await client.auth.oauth.revokeGrant({
        clientId: result.clientId,
      });
      ensure(
        !error,
        "Access was revoked, but application consent could not be reset. Please try again.",
      );
    }
    return { ok: true };
  });
}

export async function consent(principal: Principal, input: unknown) {
  firstParty(principal);
  const action = z
    .object({
      authorizationId: z.string().min(1),
      decision: z.enum(["approve", "deny"]),
      permission: z.enum(["read", "write"]).default("read"),
    })
    .parse(input);
  if (action.decision === "deny") {
    const client = await supabaseServer();
    const result = await client.auth.oauth.denyAuthorization(
      action.authorizationId,
      { skipBrowserRedirect: true },
    );
    ensure(
      !result.error && result.data,
      "Authorization could not be completed.",
    );
    return result.data;
  }
  return withOAuthLease(principal, async (lease) => {
    const client = await supabaseServer(lease.signal);
    ensure(
      lease.householdId,
      "Create or join a household first.",
      "NO_HOUSEHOLD",
      403,
    );
    const { data: details, error } =
      await client.auth.oauth.getAuthorizationDetails(action.authorizationId);
    ensure(
      !error && details && "client" in details,
      "Invalid authorization request.",
    );
    const result = await client.auth.oauth.approveAuthorization(
      action.authorizationId,
      { skipBrowserRedirect: true },
    );
    ensure(
      !result.error && result.data,
      "Authorization could not be completed.",
    );
    lease.signal.throwIfAborted();
    await databaseRpc(principal, "oauth_grant", {
      lease_id: lease.leaseId,
      household_id: lease.householdId,
      client_id: details.client.id,
      permission: action.permission,
    });
    return result.data;
  });
}
