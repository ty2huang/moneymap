import { beforeEach, describe, expect, it, vi } from "vitest";
import { consent } from "../src/server/connections";

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  rpc: vi.fn(),
  details: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
}));
vi.mock("../src/server/database", () => ({
  databaseRpc: mocks.rpc,
  withOAuthLease: mocks.lease,
}));
vi.mock("../src/server/supabase", () => ({
  supabaseServer: async () => ({
    auth: {
      oauth: {
        getAuthorizationDetails: mocks.details,
        approveAuthorization: mocks.approve,
        denyAuthorization: mocks.deny,
      },
    },
  }),
}));
const principal = { userId: "10000000-0000-4000-8000-000000000001" };
const input = {
  authorizationId: "pending-authorization",
  decision: "approve",
  permission: "write",
};
const redirect = { redirect_url: "https://client.example/callback?code=ok" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.details.mockResolvedValue({
    data: { client: { id: "client-id" } },
    error: null,
  });
  mocks.approve.mockResolvedValue({ data: redirect, error: null });
  mocks.deny.mockResolvedValue({ data: redirect, error: null });
  mocks.lease.mockImplementation(async (_p, fn) =>
    fn({
      leaseId: "lease",
      householdId: "household-id",
      activeClientIds: [],
      signal: new AbortController().signal,
    }),
  );
});

describe("OAuth consent grant ordering", () => {
  it.each([
    { data: null, error: new Error("Expired authorization") },
    { data: null, error: null },
  ])("does not reactivate a grant when approval fails: %j", async (result) => {
    mocks.approve.mockResolvedValue(result);
    await expect(consent(principal, input)).rejects.toThrow(
      "Authorization could not be completed",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not reactivate a grant when the provider throws", async () => {
    mocks.approve.mockRejectedValue(new Error("Provider unavailable"));
    await expect(consent(principal, input)).rejects.toThrow(
      "Provider unavailable",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("enables the grant only after successful provider approval under the lease", async () => {
    mocks.approve.mockImplementation(async () => {
      expect(mocks.rpc).not.toHaveBeenCalled();
      return { data: redirect, error: null };
    });
    await expect(consent(principal, input)).resolves.toEqual(redirect);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      principal,
      "oauth_grant",
      {
        lease_id: "lease",
        household_id: "household-id",
        client_id: "client-id",
        permission: "write",
      },
    );
  });
  it("does not approve at the provider if membership cannot be held stable", async () => {
    mocks.lease.mockRejectedValue(new Error("Membership has changed"));
    await expect(consent(principal, input)).rejects.toThrow(
      "Membership has changed",
    );
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies requests without changing local grants", async () => {
    await expect(
      consent(principal, { ...input, decision: "deny" }),
    ).resolves.toEqual(redirect);
    expect(mocks.deny).toHaveBeenCalledExactlyOnceWith(input.authorizationId, {
      skipBrowserRedirect: true,
    });
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
