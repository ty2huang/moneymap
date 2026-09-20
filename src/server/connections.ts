import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authorized } from "./ledger-service";
import { hash } from "./crypto";
import { firstParty, type Principal } from "./auth";
import { supabaseServer } from "./supabase";
import { ensure } from "@/domain/types";
import { asUser, lockOAuthUser, setHousehold, type Tx } from "./database";

async function activeOAuthClients(tx: Tx, userId: string) {
  const [member] = await tx
    .select()
    .from(t.members)
    .where(eq(t.members.userId, userId));
  if (!member) return new Set<string>();

  await setHousehold(tx, member.householdId);
  const grants = await tx
    .select({ clientId: t.grants.clientId })
    .from(t.grants)
    .where(
      and(
        eq(t.grants.householdId, member.householdId),
        eq(t.grants.userId, userId),
        eq(t.grants.revoked, false),
      ),
    );
  return new Set(grants.map((grant) => grant.clientId));
}

export async function authorizationDetails(
  p: Principal,
  authorizationId: string,
) {
  firstParty(p);
  return asUser(p.userId, async (tx) => {
    await lockOAuthUser(tx, p.userId);
    const activeClientIds = await activeOAuthClients(tx, p.userId);
    const client = await supabaseServer();
    const { data: grants, error } = await client.auth.oauth.listGrants();
    ensure(
      !error && grants,
      "Application access could not be checked. Please try again.",
    );

    // This project's token hook assigns every OAuth client the MoneyMap audience.
    // Remove stale provider consent before fetching details: otherwise Supabase
    // can skip the local permission form after revocation or a household change.
    for (const grant of grants) {
      if (activeClientIds.has(grant.client.id)) continue;
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

export async function connections(p: Principal) {
  firstParty(p);
  const result = await authorized(p, false, async (tx, s) => ({
    tokens: (
      await tx
        .select()
        .from(t.tokens)
        .where(
          and(
            eq(t.tokens.householdId, s.household.id),
            eq(t.tokens.userId, p.userId),
          ),
        )
    ).map(({ hash: _, ...x }) => x),
    grants: await tx
      .select()
      .from(t.grants)
      .where(
        and(
          eq(t.grants.householdId, s.household.id),
          eq(t.grants.userId, p.userId),
        ),
      ),
  }));
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
export async function connectionAction(p: Principal, input: unknown) {
  firstParty(p);
  const x = z
    .object({
      action: z.enum(["create-token", "revoke-token", "revoke-grant"]),
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(80).optional(),
      permission: z.enum(["read", "write"]).default("read"),
      days: z.number().int().min(1).max(365).default(30),
    })
    .parse(input);
  let revokedClientId: string | undefined;
  const result = await authorized(
    p,
    true,
    async (tx, s) => {
      if (x.action === "create-token") {
        ensure(x.name, "Name the token.");
        const token = "mm_" + randomBytes(32).toString("base64url");
        await tx.insert(t.tokens).values({
          id: crypto.randomUUID(),
          userId: p.userId,
          householdId: s.household.id,
          name: x.name,
          hash: hash(token),
          permission: x.permission,
          expiresAt: new Date(Date.now() + x.days * 86400000).toISOString(),
        });
        return { token };
      }
      ensure(x.id, "Select a connection.");
      if (x.action === "revoke-token") {
        await tx
          .update(t.tokens)
          .set({ revoked: true })
          .where(and(eq(t.tokens.id, x.id), eq(t.tokens.userId, p.userId)));
      } else {
        const [grant] = await tx
          .update(t.grants)
          .set({ revoked: true })
          .where(and(eq(t.grants.id, x.id), eq(t.grants.userId, p.userId)))
          .returning({ clientId: t.grants.clientId });
        revokedClientId = grant?.clientId;
      }
      return { ok: true };
    },
    { serializeOAuth: x.action === "revoke-grant" },
  );
  // Commit the local revocation even when the provider is unavailable.
  if (revokedClientId) {
    const clientId = revokedClientId;
    await asUser(p.userId, async (tx) => {
      await lockOAuthUser(tx, p.userId);
      // A new approval may have committed after the local revocation.
      const activeClients = await activeOAuthClients(tx, p.userId);
      if (activeClients.has(clientId)) return;
      const client = await supabaseServer();
      const { error } = await client.auth.oauth.revokeGrant({ clientId });
      ensure(
        !error,
        "Access was revoked, but application consent could not be reset. Please try again.",
      );
    });
  }
  return result;
}
export async function consent(p: Principal, input: unknown) {
  firstParty(p);
  const x = z
    .object({
      authorizationId: z.string().min(1),
      decision: z.enum(["approve", "deny"]),
      permission: z.enum(["read", "write"]).default("read"),
    })
    .parse(input);
  const client = await supabaseServer();
  if (x.decision === "approve") {
    return authorized(
      p,
      true,
      async (tx, s) => {
        const { data: details, error } =
          await client.auth.oauth.getAuthorizationDetails(x.authorizationId);
        ensure(
          !error && details && "client" in details,
          "Invalid authorization request.",
        );
        // Keep membership stable while approving. Provider or commit failures
        // must not create, reactivate, or upgrade local access.
        const result = await client.auth.oauth.approveAuthorization(
          x.authorizationId,
          { skipBrowserRedirect: true },
        );
        ensure(
          !result.error && result.data,
          "Authorization could not be completed.",
        );
        const clientId = details.client.id;
        const values = {
          id: crypto.randomUUID(),
          householdId: s.household.id,
          userId: p.userId,
          clientId,
          permission: x.permission,
          revoked: false,
        };
        await tx
          .insert(t.grants)
          .values(values)
          .onConflictDoUpdate({
            target: [t.grants.householdId, t.grants.userId, t.grants.clientId],
            set: { permission: x.permission, revoked: false },
          });
        return result.data;
      },
      { serializeOAuth: true },
    );
  }
  const result = await client.auth.oauth.denyAuthorization(x.authorizationId, {
    skipBrowserRedirect: true,
  });
  ensure(!result.error && result.data, "Authorization could not be completed.");
  return result.data;
}
