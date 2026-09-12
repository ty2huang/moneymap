import { eq, and, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import type { Ledger, Snapshot } from "@/domain/types";
import { ensure } from "@/domain/types";
import { applyCommand } from "@/domain/ledger";
import type { Command } from "@/domain/contracts";
import { asUser, setHousehold, type Tx } from "./database";
import { decrypt, encrypt, hash, unwrapKey } from "./crypto";
import type { Principal } from "./auth";
export async function authorized<T>(
  p: Principal,
  write: boolean,
  fn: (tx: Tx, s: Snapshot, key: Buffer) => Promise<T>,
): Promise<T> {
  return asUser(p.userId, async (tx) => {
    const [member] = await tx
      .select()
      .from(t.members)
      .where(eq(t.members.userId, p.userId));
    ensure(member, "Create or join a household first.", "NO_HOUSEHOLD", 403);
    ensure(
      !p.householdId || p.householdId === member.householdId,
      "Household access has ended.",
      "FORBIDDEN",
      403,
    );
    await setHousehold(tx, member.householdId);
    // Serialize all household reads/writes: simple, consistent snapshots and safe allocations at this scale.
    const [household] = await tx
      .select()
      .from(t.households)
      .where(eq(t.households.id, member.householdId))
      .for("update");
    ensure(household, "Household not found.");
    const [current] = await tx
      .select()
      .from(t.members)
      .where(eq(t.members.userId, p.userId));
    ensure(
      current?.householdId === member.householdId,
      "Membership has changed.",
      "FORBIDDEN",
      403,
    );
    if (p.clientId) {
      const [g] = await tx
        .select()
        .from(t.grants)
        .where(
          and(
            eq(t.grants.userId, p.userId),
            eq(t.grants.clientId, p.clientId),
            eq(t.grants.householdId, member.householdId),
          ),
        );
      ensure(
        g && !g.revoked && (!write || g.permission === "write"),
        "Connection permission denied.",
        "FORBIDDEN",
        403,
      );
    }
    if (p.tokenId) {
      const [token] = await tx
        .select()
        .from(t.tokens)
        .where(eq(t.tokens.id, p.tokenId));
      ensure(
        token &&
          !token.revoked &&
          token.userId === p.userId &&
          token.expiresAt > new Date().toISOString() &&
          (!write || token.permission === "write"),
        "Token permission denied.",
        "FORBIDDEN",
        403,
      );
    }
    const key = unwrapKey(household.wrappedKey, household.id),
      ledger = await loadLedger(tx, household.id, key);
    const { wrappedKey: _, ...publicHousehold } = household;
    return fn(tx, { household: publicHousehold, member: current, ledger }, key);
  });
}
export async function loadLedger(
  tx: Tx,
  h: string,
  key: Buffer,
): Promise<Ledger> {
  const accounts = await tx
    .select()
    .from(t.accounts)
    .where(eq(t.accounts.householdId, h));
  const categories = await tx
    .select()
    .from(t.categories)
    .where(eq(t.categories.householdId, h));
  const transactions = await tx
    .select()
    .from(t.transactions)
    .where(eq(t.transactions.householdId, h));
  const transfers = await tx
    .select()
    .from(t.transfers)
    .where(eq(t.transfers.householdId, h));
  const allocations = await tx
    .select()
    .from(t.allocations)
    .where(eq(t.allocations.householdId, h));
  const dec = (id: string, field: string, value: string) =>
    decrypt(value, key, `${h}:${id}:${field}`);
  return {
    accounts: accounts.map((a) => ({
      ...a,
      name: dec(a.id, "name", a.name),
      bankName: dec(a.id, "bankName", a.bankName),
    })),
    categories,
    transactions: transactions.map((x) => ({
      ...x,
      description: dec(x.id, "description", x.description),
      comments: dec(x.id, "comments", x.comments),
      allocations: allocations
        .filter((a) => a.receiptId === x.id)
        .map((a) => ({ expenseId: a.expenseId, amount: a.amount })),
    })),
    transfers: transfers.map((x) => ({
      ...x,
      description: dec(x.id, "description", x.description),
      comments: dec(x.id, "comments", x.comments),
    })),
  };
}
export async function persist(
  tx: Tx,
  h: string,
  before: Ledger,
  after: Ledger,
  key: Buffer,
) {
  const enc = (id: string, field: string, value: string) =>
    encrypt(value, key, `${h}:${id}:${field}`);
  // Remove allocations first so receipt deletion and reallocation remain atomic.
  await tx.delete(t.allocations).where(eq(t.allocations.householdId, h));
  for (const x of before.transactions) {
    if (!after.transactions.some((a) => a.id === x.id)) {
      await tx.delete(t.transactions).where(eq(t.transactions.id, x.id));
    }
  }
  for (const x of before.transfers) {
    if (!after.transfers.some((a) => a.id === x.id)) {
      await tx.delete(t.transfers).where(eq(t.transfers.id, x.id));
    }
  }
  for (const x of before.categories) {
    if (!after.categories.some((a) => a.id === x.id)) {
      await tx.delete(t.categories).where(eq(t.categories.id, x.id));
    }
  }
  for (const x of before.accounts) {
    if (!after.accounts.some((a) => a.id === x.id)) {
      await tx.delete(t.accounts).where(eq(t.accounts.id, x.id));
    }
  }
  for (const a of after.accounts) {
    if (before.accounts.some((x) => x.id === a.id && x.version === a.version)) {
      continue;
    }
    const row = {
      ...a,
      householdId: h,
      name: enc(a.id, "name", a.name),
      bankName: enc(a.id, "bankName", a.bankName),
    };
    await tx
      .insert(t.accounts)
      .values(row)
      .onConflictDoUpdate({ target: t.accounts.id, set: row });
  }
  for (const c of after.categories) {
    if (
      before.categories.some((x) => x.id === c.id && x.version === c.version)
    ) {
      continue;
    }
    const row = { ...c, householdId: h };
    await tx
      .insert(t.categories)
      .values(row)
      .onConflictDoUpdate({ target: t.categories.id, set: row });
  }
  for (const x of after.transactions) {
    if (
      before.transactions.some((a) => a.id === x.id && a.version === x.version)
    ) {
      continue;
    }
    const { allocations: _, ...data } = x;
    const row = {
      ...data,
      householdId: h,
      description: enc(x.id, "description", x.description),
      comments: enc(x.id, "comments", x.comments),
    };
    await tx
      .insert(t.transactions)
      .values(row)
      .onConflictDoUpdate({ target: t.transactions.id, set: row });
  }
  for (const x of after.transfers) {
    if (
      before.transfers.some((a) => a.id === x.id && a.version === x.version)
    ) {
      continue;
    }
    const row = {
      ...x,
      householdId: h,
      description: enc(x.id, "description", x.description),
      comments: enc(x.id, "comments", x.comments),
    };
    await tx
      .insert(t.transfers)
      .values(row)
      .onConflictDoUpdate({ target: t.transfers.id, set: row });
  }
  for (const x of after.transactions) {
    for (const a of x.allocations) {
      await tx
        .insert(t.allocations)
        .values({ householdId: h, receiptId: x.id, ...a });
    }
  }
}
export async function snapshot(p: Principal) {
  return authorized(p, false, async (_tx, s) => s);
}
export async function mutate(
  p: Principal,
  command: Command,
  idempotencyKey?: string,
) {
  return authorized(p, true, async (tx, s, key) => {
    const h = s.household.id;
    const requestHash = hash(JSON.stringify(command));
    if (idempotencyKey) {
      ensure(idempotencyKey.length <= 128, "Idempotency key too long.");
      const [entry] = await tx
        .select()
        .from(t.idempotency)
        .where(
          and(
            eq(t.idempotency.householdId, h),
            eq(t.idempotency.userId, p.userId),
            eq(t.idempotency.key, idempotencyKey),
          ),
        );
      if (entry) {
        ensure(
          entry.requestHash === requestHash,
          "Idempotency key was used for a different request.",
          "CONFLICT",
          409,
        );
        return { revision: s.household.revision, replayed: true };
      }
    }
    const after = applyCommand(
      s.ledger,
      command,
      s.household.currency,
      p.userId,
    );
    await persist(tx, h, s.ledger, after, key);
    await tx
      .update(t.households)
      .set({ revision: s.household.revision + 1 })
      .where(eq(t.households.id, h));
    await tx.insert(t.audit).values({
      id: crypto.randomUUID(),
      householdId: h,
      userId: p.userId,
      action: command.type,
      recordId: command.data.id,
      at: new Date().toISOString(),
    });
    if (idempotencyKey) {
      await tx.insert(t.idempotency).values({
        householdId: h,
        userId: p.userId,
        key: idempotencyKey,
        requestHash,
      });
    }
    return { revision: s.household.revision + 1, replayed: false };
  });
}
