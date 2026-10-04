import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  authorizationDetails,
  connectionAction,
  consent,
} from "../src/server/connections";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  approve: vi.fn(),
  signal: undefined as AbortSignal | undefined,
}));
vi.mock("@supabase/server/core", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../src/server/supabase", () => ({
  supabaseServer: async (signal?: AbortSignal) => {
    mocks.signal = signal;
    return {
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
    };
  },
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
let lease: string | null;
let leaseExpiresAt: number;
let failRenewal: boolean;
let localActive: boolean;
let providerActive: boolean;
let busyAttempt: (() => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  lease = null;
  leaseExpiresAt = 0;
  failRenewal = false;
  mocks.signal = undefined;
  localActive = providerActive = false;
  busyAttempt = undefined;
  mocks.rpc.mockImplementation(async (_name, { operation, payload }) => {
    if (operation === "oauth_begin") {
      if (lease && leaseExpiresAt > Date.now()) {
        busyAttempt?.();
        return {
          data: null,
          error: { code: "P0001", details: "OAUTH_BUSY", message: "Busy" },
        };
      }
      lease = crypto.randomUUID();
      leaseExpiresAt = Date.now() + 120_000;
      return {
        data: {
          leaseId: lease,
          householdId: "household",
          activeClientIds: localActive ? ["client"] : [],
        },
        error: null,
      };
    }
    expect(payload.lease_id).toBe(lease);
    if (operation === "oauth_renew") {
      if (failRenewal || leaseExpiresAt <= Date.now())
        return {
          data: null,
          error: {
            code: "P0001",
            details: "FORBIDDEN",
            message: "Lease expired",
          },
        };
      leaseExpiresAt = Date.now() + 120_000;
    }
    if (operation === "oauth_end") lease = null;
    if (operation === "oauth_grant") localActive = true;
    if (operation === "connection_action") {
      localActive = false;
      return { data: { ok: true, clientId: "client" }, error: null };
    }
    return { data: { ok: true }, error: null };
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

it("waits for reconciliation before approving another authorization", async () => {
  const listing = deferred(),
    resume = deferred();
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
  busyAttempt = attempted.resolve;
  const approving = consent(principal, approval);
  await attempted.promise;
  expect(mocks.approve).not.toHaveBeenCalled();
  resume.resolve();
  await Promise.all([reconciliation, approving]);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
});

it("reads active local grants after an in-flight approval commits", async () => {
  const approved = deferred(),
    resume = deferred();
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
  busyAttempt = attempted.resolve;
  const reconciliation = authorizationDetails(principal, "other-request");
  await attempted.promise;
  expect(mocks.list).not.toHaveBeenCalled();
  resume.resolve();
  await Promise.all([approving, reconciliation]);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
  expect(mocks.revoke).not.toHaveBeenCalled();
});

it("prevents a provider revocation from undoing concurrent reapproval", async () => {
  localActive = providerActive = true;
  const revoking = deferred(),
    resume = deferred();
  mocks.revoke.mockImplementation(async () => {
    expect(localActive).toBe(false);
    revoking.resolve();
    await resume.promise;
    providerActive = false;
    return { data: {}, error: null };
  });
  const revocation = connectionAction(principal, {
    action: "revoke-grant",
    id: "10000000-0000-4000-8000-000000000002",
  });
  await revoking.promise;
  const attempted = deferred();
  busyAttempt = attempted.resolve;
  const approving = consent(principal, approval);
  await attempted.promise;
  expect(mocks.approve).not.toHaveBeenCalled();
  resume.resolve();
  await Promise.all([revocation, approving]);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
});

it("releases the database lease after a provider failure", async () => {
  mocks.list.mockRejectedValueOnce(new Error("Provider unavailable"));
  await expect(authorizationDetails(principal, "request")).rejects.toThrow(
    "Provider unavailable",
  );
  expect(lease).toBeNull();
  await consent(principal, approval);
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
});

afterEach(() => vi.useRealTimers());

it("renews a lease past its original expiry while revocation is pending", async () => {
  vi.useFakeTimers();
  localActive = providerActive = true;
  const revoking = deferred(),
    resume = deferred();
  mocks.revoke.mockImplementation(async () => {
    revoking.resolve();
    await resume.promise;
    providerActive = false;
    return { data: {}, error: null };
  });
  const revocation = connectionAction(principal, {
    action: "revoke-grant",
    id: "10000000-0000-4000-8000-000000000002",
  });
  await revoking.promise;
  const initialLease = lease;
  await vi.advanceTimersByTimeAsync(130_000);
  expect(lease).toBe(initialLease);
  expect(leaseExpiresAt).toBeGreaterThan(Date.now());
  const attempted = deferred();
  busyAttempt = attempted.resolve;
  const approving = consent(principal, approval);
  await attempted.promise;
  expect(mocks.approve).not.toHaveBeenCalled();
  resume.resolve();
  await revocation;
  await vi.advanceTimersByTimeAsync(100);
  await approving;
  expect(localActive).toBe(true);
  expect(providerActive).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels provider work and releases the lease if renewal fails", async () => {
  vi.useFakeTimers();
  failRenewal = true;
  const listing = deferred();
  mocks.list.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        const signal = mocks.signal!;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
        listing.resolve();
      }),
  );
  const result = authorizationDetails(principal, "request");
  const rejected = expect(result).rejects.toThrow("Lease expired");
  await listing.promise;
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  expect(mocks.signal?.aborted).toBe(true);
  expect(lease).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
