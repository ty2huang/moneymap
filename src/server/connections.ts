import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authorized } from "./ledger-service";
import { hash } from "./crypto";
import { firstParty, type Principal } from "./auth";
import { supabaseServer } from "./supabase";
import { ensure } from "@/domain/types";
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
  return authorized(p, true, async (tx, s) => {
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
      await tx
        .update(t.grants)
        .set({ revoked: true })
        .where(and(eq(t.grants.id, x.id), eq(t.grants.userId, p.userId)));
    }
    return { ok: true };
  });
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
  const { data: details, error } =
    await client.auth.oauth.getAuthorizationDetails(x.authorizationId);
  ensure(
    !error && details && "client" in details,
    "Invalid authorization request.",
  );
  if (x.decision === "approve") {
    await authorized(p, true, async (tx, s) => {
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
    });
  }
  const result =
    x.decision === "approve"
      ? await client.auth.oauth.approveAuthorization(x.authorizationId, {
          skipBrowserRedirect: true,
        })
      : await client.auth.oauth.denyAuthorization(x.authorizationId, {
          skipBrowserRedirect: true,
        });
  ensure(!result.error && result.data, "Authorization could not be completed.");
  return result.data;
}
