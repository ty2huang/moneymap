import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "../src/server/auth";
import { hash } from "../src/server/crypto";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/server/database", () => ({ databaseRpc: mocks.rpc }));
beforeEach(() => vi.resetAllMocks());

describe("personal token authentication over HTTPS", () => {
  it("resolves only the token hash and carries it for database revalidation", async () => {
    mocks.rpc.mockResolvedValue({
      id: "token",
      user_id: "user",
      household_id: "household",
      permission: "read",
    });
    const token = "mm_disposable-token";
    expect(
      await authenticate(
        new Request("https://money.example/api/state", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
    ).toMatchObject({
      tokenId: "token",
      tokenHash: hash(token),
      userId: "user",
      householdId: "household",
      permission: "read",
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      undefined,
      "resolve_token",
      { token_hash: hash(token) },
    );
  });
  it("rejects expired or revoked tokens rather than using cookie authentication", async () => {
    mocks.rpc.mockResolvedValue(null);
    await expect(
      authenticate(
        new Request("https://money.example/api/state", {
          headers: { Authorization: "Bearer mm_expired-token" },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
