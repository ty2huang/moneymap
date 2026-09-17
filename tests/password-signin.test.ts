import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/auth/password/route";
import { supabaseServer } from "../src/server/supabase";

vi.mock("../src/server/supabase", () => ({ supabaseServer: vi.fn() }));

const signIn = vi.fn();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("APP_HOST", "");
  vi.stubEnv("PORT", "3101");
  vi.mocked(supabaseServer).mockResolvedValue({
    auth: { signInWithPassword: signIn },
  } as unknown as Awaited<ReturnType<typeof supabaseServer>>);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

function request(
  origin = "http://localhost:3101",
  credentials: unknown = {
    email: "tester@example.com",
    password: "test-password",
  },
) {
  return new Request("http://localhost:3101/auth/password", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      Authorization: "Bearer ignored",
    },
    body: JSON.stringify(credentials),
  });
}

describe("development password sign-in", () => {
  it("rejects production requests before contacting Auth", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request())).status).toBe(404);
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("rejects cross-origin login even with an Authorization header", async () => {
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("validates credentials before contacting Auth", async () => {
    expect(
      (await POST(request(undefined, { email: "invalid", password: "" })))
        .status,
    ).toBe(400);
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("signs in through the cookie-aware client without returning tokens", async () => {
    signIn.mockResolvedValue({
      data: { session: { access_token: "secret" }, user: { id: "user" } },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledWith({
      email: "tester@example.com",
      password: "test-password",
    });
  });

  it("returns a generic authentication error", async () => {
    signIn.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Internal Auth details" },
    });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Internal Auth details");
  });
});
