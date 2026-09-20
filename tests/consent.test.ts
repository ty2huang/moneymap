import { beforeEach, describe, expect, it, vi } from "vitest";
import { consent } from "../src/server/connections";

const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  details: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../src/server/ledger-service", () => ({
  authorized: mocks.authorized,
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
  mocks.authorized.mockImplementation(async (_p, _write, fn) =>
    fn(
      {
        insert: () => ({
          values: () => ({ onConflictDoUpdate: mocks.upsert }),
        }),
      },
      { household: { id: "household-id" } },
    ),
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
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not reactivate a grant when the provider throws", async () => {
    mocks.approve.mockRejectedValue(new Error("Provider unavailable"));

    await expect(consent(principal, input)).rejects.toThrow(
      "Provider unavailable",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("enables the grant only after successful provider approval", async () => {
    mocks.approve.mockImplementation(async () => {
      expect(mocks.upsert).not.toHaveBeenCalled();
      return { data: redirect, error: null };
    });

    await expect(consent(principal, input)).resolves.toEqual(redirect);
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({
      target: expect.any(Array),
      set: { permission: "write", revoked: false },
    });
  });

  it("does not approve at the provider if household authorization fails", async () => {
    mocks.authorized.mockRejectedValue(new Error("Membership has changed"));

    await expect(consent(principal, input)).rejects.toThrow(
      "Membership has changed",
    );
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("denies requests without changing local grants", async () => {
    await expect(
      consent(principal, { ...input, decision: "deny" }),
    ).resolves.toEqual(redirect);
    expect(mocks.deny).toHaveBeenCalledExactlyOnceWith(input.authorizationId, {
      skipBrowserRedirect: true,
    });
    expect(mocks.authorized).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
