import { beforeEach, expect, it, vi } from "vitest";
import * as tables from "../src/db/schema";
import {
  authorizationDetails,
  connectionAction,
  consent,
} from "../src/server/connections";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  approve: vi.fn(),
}));

vi.mock("../src/server/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/database")>()),
  asUser: mocks.transaction,
  setHousehold: vi.fn(),
}));
vi.mock("../src/server/crypto", () => ({ unwrapKey: () => Buffer.alloc(32) }));
vi.mock("../src/server/supabase", () => ({
  supabaseServer: async () => ({
    auth: {
      oauth: {
        listGrants: mocks.list,
        revokeGrant: mocks.revoke,
        approveAuthorization: mocks.approve,
        getAuthorizationDetails: async () => ({
          data: { client: { id: "client" } },
          error: null,
        }),
      },
    },
  }),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const principal = { userId: "10000000-0000-4000-8000-000000000001" };
const approval = { authorizationId: "request", decision: "approve" };
let localActive: boolean;
let providerActive: boolean;
let lockTail: Promise<void>;
let onLockAttempt: (() => void) | undefined;
let afterCommit: (() => Promise<void>) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  localActive = false;
  providerActive = false;
  lockTail = Promise.resolve();
  onLockAttempt = undefined;
  afterCommit = undefined;
  // Simulate transaction-scoped advisory locks and committed grant visibility.
  // Both production reconciliation and production authorized() use this driver.
  mocks.transaction.mockImplementation(async (_userId, fn) => {
    let release: (() => void) | undefined;
    let pendingActive: boolean | undefined;
    const tx = {
      execute: async () => {
        const previous = lockTail;
        const gate = deferred();
        lockTail = gate.promise;
        onLockAttempt?.();
        await previous;
        release = gate.resolve;
        return [];
      },
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            const rows =
              table === tables.members
                ? [{ householdId: "household", userId: principal.userId }]
                : table === tables.households
                  ? [{ id: "household", wrappedKey: "key" }]
                  : table === tables.grants && localActive
                    ? [{ clientId: "client" }]
                    : [];
            return Object.assign(Promise.resolve(rows), {
              for: async () => rows,
            });
          },
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => {
            pendingActive = true;
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => {
              pendingActive = false;
              return [{ clientId: "client" }];
            },
          }),
        }),
      }),
    };
    let result;
    try {
      result = await fn(tx);
      if (pendingActive !== undefined) localActive = pendingActive;
    } finally {
      release?.();
    }
    const callback = afterCommit;
    afterCommit = undefined;
    await callback?.();
    return result;
  });
  mocks.list.mockImplementation(async () => ({
    data: providerActive ? [{ client: { id: "client" } }] : [],
    error: null,
  }));
  mocks.approve.mockImplementation(async () => {
    providerActive = true;
    return {
      data: { redirect_url: "https://example.com/callback" },
      error: null,
    };
  });
  mocks.revoke.mockImplementation(async () => {
    providerActive = false;
    return { data: {}, error: null };
  });
});

it("blocks approval until reconciliation finishes with its local snapshot", async () => {
  const listing = deferred();
  const resume = deferred();
  mocks.list.mockImplementation(async () => {
    listing.resolve();
    await resume.promise;
    return {
      data: providerActive ? [{ client: { id: "client" } }] : [],
      error: null,
    };
  });
  const reconciliation = authorizationDetails(principal, "other-request");
  await listing.promise;
  const attempted = deferred();
  onLockAttempt = attempted.resolve;
  const approving = consent(principal, approval);
  await attempted.promise;
  expect(mocks.approve).not.toHaveBeenCalled();
  resume.resolve();
  await Promise.all([reconciliation, approving]);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
  expect(mocks.revoke).not.toHaveBeenCalled();
});

it("waits for approval to commit before reading active local grants", async () => {
  const approved = deferred();
  const resume = deferred();
  mocks.approve.mockImplementation(async () => {
    providerActive = true;
    approved.resolve();
    await resume.promise;
    return {
      data: { redirect_url: "https://example.com/callback" },
      error: null,
    };
  });
  const approving = consent(principal, approval);
  await approved.promise;
  const attempted = deferred();
  onLockAttempt = attempted.resolve;
  const reconciliation = authorizationDetails(principal, "other-request");
  await attempted.promise;
  expect(mocks.list).not.toHaveBeenCalled();
  resume.resolve();
  await Promise.all([approving, reconciliation]);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
  expect(mocks.revoke).not.toHaveBeenCalled();
});

it("preserves reapproval committed between local and provider revocation", async () => {
  localActive = providerActive = true;
  afterCommit = async () => {
    await consent(principal, approval);
  };
  await connectionAction(principal, {
    action: "revoke-grant",
    id: "10000000-0000-4000-8000-000000000002",
  });
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
  expect(mocks.revoke).not.toHaveBeenCalled();
});

it("releases reconciliation's lock after a provider failure", async () => {
  mocks.list.mockRejectedValueOnce(new Error("Provider unavailable"));
  await expect(authorizationDetails(principal, "request")).rejects.toThrow(
    "Provider unavailable",
  );
  await consent(principal, approval);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
});
