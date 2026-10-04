import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizationDetails,
  connectionAction,
} from "../src/server/connections";

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  rpc: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  details: vi.fn(),
}));
vi.mock("../src/server/database", () => ({
  databaseRpc: mocks.rpc,
  withOAuthLease: mocks.lease,
}));
vi.mock("../src/server/supabase", () => ({
  supabaseServer: async () => ({
    auth: {
      oauth: {
        listGrants: mocks.list,
        revokeGrant: mocks.revoke,
        getAuthorizationDetails: mocks.details,
      },
    },
  }),
}));
const principal = { userId: "10000000-0000-4000-8000-000000000001" };
const grantId = "10000000-0000-4000-8000-000000000002";
function localGrants(householdId: string | null, activeClientIds: string[]) {
  mocks.lease.mockImplementation(async (_p, fn) =>
    fn({ leaseId: "lease", householdId, activeClientIds }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  localGrants("current-household", []);
  mocks.list.mockResolvedValue({
    data: [{ client: { id: "client" } }],
    error: null,
  });
  mocks.revoke.mockResolvedValue({ data: {}, error: null });
  mocks.details.mockResolvedValue({
    data: { client: { id: "client", name: "App" } },
    error: null,
  });
});
describe("OAuth reconnection", () => {
  it.each(["revoked", "previous-household"])(
    "clears provider consent for a %s local grant before fetching details",
    async () => {
      mocks.details.mockImplementation(async () => {
        expect(mocks.revoke).toHaveBeenCalledWith({ clientId: "client" });
        return { data: { client: { id: "client" } }, error: null };
      });
      expect(
        (await authorizationDetails(principal, "request")).data,
      ).toHaveProperty("client");
    },
  );
  it("keeps active consent in the current household", async () => {
    localGrants("current-household", ["client"]);
    await authorizationDetails(principal, "request");
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("resets stale consent when the user no longer has a household", async () => {
    localGrants(null, []);
    await authorizationDetails(principal, "request");
    expect(mocks.revoke).toHaveBeenCalledWith({ clientId: "client" });
  });
  it("preserves valid clients while resetting stale clients", async () => {
    localGrants("current-household", ["keep"]);
    mocks.list.mockResolvedValue({
      data: [{ client: { id: "keep" } }, { client: { id: "reset" } }],
      error: null,
    });
    await authorizationDetails(principal, "request");
    expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith({ clientId: "reset" });
  });
  it("does not revoke anything when local access cannot be checked", async () => {
    mocks.lease.mockRejectedValue(new Error("Database unavailable"));
    await expect(authorizationDetails(principal, "request")).rejects.toThrow(
      "Database unavailable",
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it("does not fetch details when provider grants cannot be listed", async () => {
    mocks.list.mockResolvedValue({
      data: null,
      error: new Error("Unavailable"),
    });
    await expect(authorizationDetails(principal, "request")).rejects.toThrow(
      "could not be checked",
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it("does not accept automatic consent if resetting it fails", async () => {
    mocks.revoke.mockResolvedValue({
      data: null,
      error: new Error("Unavailable"),
    });
    await expect(authorizationDetails(principal, "request")).rejects.toThrow(
      "could not be reset",
    );
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it("commits local revocation before attempting provider revocation", async () => {
    let committed = false;
    mocks.rpc.mockImplementation(async () => {
      committed = true;
      return { ok: true, clientId: "client" };
    });
    mocks.revoke.mockImplementation(async () => {
      expect(committed).toBe(true);
      return { data: null, error: new Error("Unavailable") };
    });
    await expect(
      connectionAction(principal, { action: "revoke-grant", id: grantId }),
    ).rejects.toThrow("Access was revoked");
    expect(committed).toBe(true);
  });
});
