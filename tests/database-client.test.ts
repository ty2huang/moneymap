import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { databaseRpc } from "../src/server/database";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_server_credential");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

it("authenticates HTTPS database requests with the server secret", async () => {
  await databaseRpc({ userId: "verified-user" }, "session");
  const [url, options] = fetchMock.mock.calls[0];
  const headers = new Headers(options.headers);
  expect(String(url)).toBe("https://database.example/rest/v1/rpc/moneymap");
  expect(headers.get("apikey")).toBe("sb_secret_test_server_credential");
  expect(headers.get("authorization")).toBe(
    "Bearer sb_secret_test_server_credential",
  );
  expect(JSON.parse(options.body).payload.user_id).toBe("verified-user");
});

it("overwrites supplied identity with the backend's verified principal", async () => {
  await databaseRpc(
    {
      userId: "verified-user",
      clientId: "verified-client",
      tokenHash: "verified-hash",
    },
    "snapshot",
    {
      user_id: "forged-user",
      actor_client_id: "forged-client",
      token_hash: "forged-hash",
    },
  );
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).payload).toEqual({
    user_id: "verified-user",
    actor_client_id: "verified-client",
    token_hash: "verified-hash",
  });
});

it("cannot manufacture a user identity without an authenticated principal", async () => {
  await databaseRpc(undefined, "session", {
    user_id: "forged-user",
    actor_client_id: "forged-client",
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).payload).toEqual({});
});

it("preserves the application being approved separately from caller identity", async () => {
  await databaseRpc({ userId: "verified-user" }, "oauth_grant", {
    client_id: "approved-application",
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).payload).toEqual({
    user_id: "verified-user",
    client_id: "approved-application",
  });
});
