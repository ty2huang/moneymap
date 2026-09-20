import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapshot } from "../src/server/ledger-service";
import { newKey } from "../src/server/crypto";

const mocks = vi.hoisted(() => ({ asUser: vi.fn() }));
vi.mock("../src/server/database", () => ({
  asUser: mocks.asUser,
  setHousehold: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const householdId = "20000000-0000-4000-8000-000000000001";
const tokenId = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
  vi.stubEnv(
    "MONEYMAP_MASTER_KEYS",
    JSON.stringify({
      "1": Buffer.alloc(32, 1).toString("base64"),
    }),
  );
  vi.stubEnv("MONEYMAP_ACTIVE_KEY_VERSION", "1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

function mockSnapshot(expiresAt: string) {
  const member = { userId, householdId, role: "owner" };
  const household = {
    id: householdId,
    currency: "USD",
    revision: 0,
    wrappedKey: newKey(householdId),
  };
  const results = [
    [member],
    [household],
    [member],
    [
      {
        id: tokenId,
        userId,
        householdId,
        permission: "read",
        revoked: false,
        expiresAt,
      },
    ],
    [],
    [],
    [],
    [],
    [],
  ];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => {
          const result = Promise.resolve(results.shift());
          return Object.assign(result, { for: () => result });
        },
      }),
    }),
  };
  mocks.asUser.mockImplementation(async (_userId, fn) => fn(tx));
}

describe("personal token expiration during authorization", () => {
  it.each([
    "2026-09-19 23:00:00+00",
    "2026-09-19 15:00:00+02",
    "2026-09-19T12:00:00.001Z",
  ])("accepts an unexpired token with timestamp %s", async (expiresAt) => {
    mockSnapshot(expiresAt);
    await expect(
      snapshot({ userId, householdId, tokenId }),
    ).resolves.toMatchObject({
      household: { id: householdId },
    });
  });

  it.each([
    "2026-09-19 11:59:59+00",
    "2026-09-19 12:00:00+00",
    "2026-09-19 13:00:00+02",
    "invalid",
  ])("rejects an expired or invalid timestamp %s", async (expiresAt) => {
    mockSnapshot(expiresAt);
    await expect(
      snapshot({ userId, householdId, tokenId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
