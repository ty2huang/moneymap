import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizationDetails,
  connectionAction,
} from "../src/server/connections";

const mocks = vi.hoisted(() => ({
  asUser: vi.fn(),
  setHousehold: vi.fn(),
  authorized: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  details: vi.fn(),
}));

vi.mock("../src/server/database", () => ({
  asUser: mocks.asUser,
  setHousehold: mocks.setHousehold,
  lockOAuthUser: vi.fn(),
}));
vi.mock("../src/server/ledger-service", () => ({
  authorized: mocks.authorized,
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

function localGrants(householdId: string | null, activeClients: string[]) {
  const rows = [
    householdId ? [{ householdId }] : [],
    activeClients.map((clientId) => ({ clientId })),
  ];
  mocks.asUser.mockImplementation(async (_userId, fn) =>
    fn({
      select: () => ({ from: () => ({ where: async () => rows.shift() }) }),
    }),
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
      // Neither a revoked grant nor one from another household is active here.
      mocks.details.mockImplementation(async () => {
        expect(mocks.revoke).toHaveBeenCalledWith({ clientId: "client" });
        return { data: { client: { id: "client" } }, error: null };
      });
      const result = await authorizationDetails(principal, "request");
      expect(result.data).toHaveProperty("client");
      expect(mocks.asUser).toHaveBeenCalledWith(
        principal.userId,
        expect.any(Function),
      );
      expect(mocks.setHousehold).toHaveBeenCalledWith(
        expect.anything(),
        "current-household",
      );
    },
  );

  it("keeps active consent in the current household", async () => {
    localGrants("current-household", ["client"]);
    const redirect = { redirect_url: "https://app.example/callback?code=ok" };
    mocks.details.mockResolvedValue({ data: redirect, error: null });
    expect(await authorizationDetails(principal, "request")).toEqual({
      data: redirect,
      error: null,
    });
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("resets stale consent when the user no longer has a household", async () => {
    localGrants(null, []);
    await authorizationDetails(principal, "request");
    expect(mocks.setHousehold).not.toHaveBeenCalled();
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
    mocks.asUser.mockRejectedValue(new Error("Database unavailable"));
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
    mocks.authorized.mockImplementation(async (_p, _write, fn) => {
      const result = await fn(
        {
          update: () => ({
            set: () => ({
              where: () => ({
                returning: async () => [{ clientId: "client" }],
              }),
            }),
          }),
        },
        { household: { id: "current-household" } },
      );
      committed = true;
      return result;
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
