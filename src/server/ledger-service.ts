import type { Ledger, Snapshot } from "@/domain/types";
import { DomainError, ensure } from "@/domain/types";
import { applyCommand } from "@/domain/ledger";
import type { Command } from "@/domain/contracts";
import { databaseRpc } from "./database";
import { decrypt, encrypt, hash, unwrapKey } from "./crypto";
import type { Principal } from "./auth";

type StoredSnapshot = Snapshot & {
  household: Snapshot["household"] & { wrappedKey: string };
};

function decryptLedger(
  ledger: Ledger,
  householdId: string,
  key: Buffer,
): Ledger {
  const dec = (id: string, field: string, value: string) =>
    decrypt(value, key, `${householdId}:${id}:${field}`);
  return {
    accounts: ledger.accounts.map((a) => ({
      ...a,
      name: dec(a.id, "name", a.name),
      bankName: dec(a.id, "bankName", a.bankName),
    })),
    categories: ledger.categories,
    transactions: ledger.transactions.map((t) => ({
      ...t,
      description: dec(t.id, "description", t.description),
      comments: dec(t.id, "comments", t.comments),
    })),
    transfers: ledger.transfers.map((t) => ({
      ...t,
      description: dec(t.id, "description", t.description),
      comments: dec(t.id, "comments", t.comments),
    })),
  };
}

/** Keep unchanged ciphertext unchanged, including during optimistic retries. */
function encryptLedger(
  before: StoredSnapshot,
  after: Ledger,
  key: Buffer,
): Ledger {
  const h = before.household.id;
  const enc = (id: string, field: string, value: string) =>
    encrypt(value, key, `${h}:${id}:${field}`);
  return {
    categories: after.categories,
    accounts: after.accounts.map((a) => {
      const saved = before.ledger.accounts.find((row) => row.id === a.id);
      return saved?.version === a.version
        ? saved
        : {
            ...a,
            name: enc(a.id, "name", a.name),
            bankName: enc(a.id, "bankName", a.bankName),
          };
    }),
    transactions: after.transactions.map((t) => {
      const saved = before.ledger.transactions.find((row) => row.id === t.id);
      return saved?.version === t.version
        ? saved
        : {
            ...t,
            description: enc(t.id, "description", t.description),
            comments: enc(t.id, "comments", t.comments),
          };
    }),
    transfers: after.transfers.map((t) => {
      const saved = before.ledger.transfers.find((row) => row.id === t.id);
      return saved?.version === t.version
        ? saved
        : {
            ...t,
            description: enc(t.id, "description", t.description),
            comments: enc(t.id, "comments", t.comments),
          };
    }),
  };
}

export async function snapshot(principal: Principal): Promise<Snapshot> {
  const stored = await databaseRpc<StoredSnapshot>(principal, "snapshot");
  const { wrappedKey, ...household } = stored.household;
  return {
    household,
    member: stored.member,
    ledger: decryptLedger(
      stored.ledger,
      household.id,
      unwrapKey(wrappedKey, household.id),
    ),
  };
}

export async function mutate(
  principal: Principal,
  command: Command,
  idempotencyKey?: string,
) {
  ensure(
    !idempotencyKey || idempotencyKey.length <= 128,
    "Idempotency key too long.",
  );
  const recordId = command.data.id ?? crypto.randomUUID();
  const requestHash = hash(JSON.stringify(command));
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await databaseRpc<
      StoredSnapshot | { revision: number; replayed: true }
    >(principal, "snapshot", {
      write: true,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
    });
    if ("replayed" in stored) return stored;
    const key = unwrapKey(stored.household.wrappedKey, stored.household.id);
    const before = decryptLedger(stored.ledger, stored.household.id, key);
    const after = applyCommand(
      before,
      command,
      stored.household.currency,
      principal.userId,
      recordId,
    );
    try {
      return await databaseRpc<{ revision: number; replayed: boolean }>(
        principal,
        "save_ledger",
        {
          household_id: stored.household.id,
          expected_revision: stored.household.revision,
          ledger: encryptLedger(stored, after, key),
          action: command.type,
          record_id: recordId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
        },
      );
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "REVISION_CONFLICT")
        throw error;
    }
  }
  throw new DomainError(
    "CONFLICT",
    "The household changed. Please try again.",
    409,
  );
}
