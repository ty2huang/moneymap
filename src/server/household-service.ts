import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { emptyLedger } from "@/domain/catalog";
import { ensure } from "@/domain/types";
import { asUser, setHousehold } from "./database";
import { newKey, unwrapKey, hash } from "./crypto";
import { authorized, persist } from "./ledger-service";
import { firstParty, type Principal } from "./auth";
export async function session(p: Principal) {
  firstParty(p);
  return asUser(p.userId, async (tx) => {
    const [member] = await tx
      .select()
      .from(t.members)
      .where(eq(t.members.userId, p.userId));
    const requests = await tx
      .select()
      .from(t.requests)
      .where(eq(t.requests.userId, p.userId));
    return { userId: p.userId, member: member ?? null, requests };
  });
}
export async function createHousehold(p: Principal, input: unknown) {
  firstParty(p);
  const x = z
    .object({
      currency: z.enum(["CAD", "USD"]),
    })
    .parse(input);
  return asUser(p.userId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${p.userId}))`);
    const [existing] = await tx
      .select()
      .from(t.members)
      .where(eq(t.members.userId, p.userId));
    ensure(!existing, "You already belong to a household.");
    const id = crypto.randomUUID();
    await setHousehold(tx, id);
    const wrappedKey = newKey(id);
    await tx.insert(t.households).values({ id, ...x, wrappedKey });
    await tx.insert(t.members).values({
      userId: p.userId,
      householdId: id,
      role: "owner",
      displayName: p.displayName ?? "Member",
    });
    await persist(
      tx,
      id,
      { accounts: [], categories: [], transactions: [], transfers: [] },
      emptyLedger(),
      unwrapKey(wrappedKey, id),
    );
    return { id };
  });
}
export async function requestJoin(p: Principal, input: unknown) {
  firstParty(p);
  const { token } = z
    .object({ token: z.string().min(20).max(200) })
    .parse(input);
  return asUser(p.userId, async (tx) => {
    const result = await tx.execute(
      sql`select webapp.request_join(${hash(token)},${p.displayName ?? "Member"}) as id`,
    );
    ensure(result[0]?.id, "Invitation is invalid or expired.");
    return { id: result[0].id };
  });
}
export async function householdInfo(p: Principal) {
  firstParty(p);
  return authorized(p, false, async (tx, s) => ({
    household: s.household,
    member: s.member,
    members: await tx
      .select()
      .from(t.members)
      .where(eq(t.members.householdId, s.household.id)),
    requests:
      s.member.role === "owner"
        ? await tx
            .select()
            .from(t.requests)
            .where(eq(t.requests.householdId, s.household.id))
        : [],
    invitations:
      s.member.role === "owner"
        ? (
            await tx
              .select()
              .from(t.invitations)
              .where(eq(t.invitations.householdId, s.household.id))
          ).map(({ hash: _, ...r }) => r)
        : [],
  }));
}
export async function householdAction(p: Principal, input: unknown) {
  firstParty(p);
  const x = z
    .object({
      action: z.enum([
        "invite",
        "revoke-invite",
        "approve",
        "reject",
        "remove",
        "promote",
        "leave",
      ]),
      id: z.string().uuid().optional(),
    })
    .parse(input);
  return authorized(p, true, async (tx, s) => {
    const h = s.household.id;
    ensure(
      s.member.role === "owner" || x.action === "leave",
      "Only owners manage household membership.",
      "FORBIDDEN",
      403,
    );
    if (x.action === "invite") {
      const token = randomBytes(32).toString("base64url");
      await tx.insert(t.invitations).values({
        id: crypto.randomUUID(),
        householdId: h,
        hash: hash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      return { url: `${process.env.APP_URL}/?invite=${token}` };
    }
    ensure(x.id || x.action === "leave", "Select a record.");
    if (x.action === "revoke-invite") {
      await tx
        .update(t.invitations)
        .set({ revoked: true })
        .where(
          and(eq(t.invitations.id, x.id!), eq(t.invitations.householdId, h)),
        );
    }
    if (x.action === "approve" || x.action === "reject") {
      const [request] = await tx
        .select()
        .from(t.requests)
        .where(and(eq(t.requests.id, x.id!), eq(t.requests.householdId, h)));
      ensure(request?.status === "pending", "Request is no longer pending.");
      if (x.action === "approve") {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${request.userId}))`,
        );
        await tx.insert(t.members).values({
          userId: request.userId,
          householdId: h,
          role: "member",
          displayName: request.displayName,
        });
      }
      await tx
        .update(t.requests)
        .set({ status: x.action === "approve" ? "approved" : "rejected" })
        .where(eq(t.requests.id, request.id));
    }
    if (["remove", "leave", "promote"].includes(x.action)) {
      const userId = x.action === "leave" ? p.userId : x.id!;
      const members = await tx
        .select()
        .from(t.members)
        .where(eq(t.members.householdId, h));
      const member = members.find((m) => m.userId === userId);
      ensure(member, "Member not found.");
      if (x.action === "promote") {
        await tx
          .update(t.members)
          .set({ role: "owner" })
          .where(eq(t.members.userId, userId));
      } else {
        if (x.action === "leave" && members.length === 1) {
          // The household lock held by authorized serializes membership changes.
          // Foreign keys remove all household data in this same transaction.
          await tx.delete(t.households).where(eq(t.households.id, h));
          return { ok: true };
        }
        ensure(
          member.role !== "owner" ||
            members.filter((m) => m.role === "owner").length > 1,
          "Promote another owner before the last owner leaves.",
        );
        await tx
          .update(t.tokens)
          .set({ revoked: true })
          .where(and(eq(t.tokens.householdId, h), eq(t.tokens.userId, userId)));
        await tx
          .update(t.grants)
          .set({ revoked: true })
          .where(and(eq(t.grants.householdId, h), eq(t.grants.userId, userId)));
        await tx.delete(t.members).where(eq(t.members.userId, userId));
      }
    }
    await tx
      .update(t.households)
      .set({ revision: s.household.revision + 1 })
      .where(eq(t.households.id, h));
    return { ok: true };
  });
}
