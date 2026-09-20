import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/lib/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser API client", () => {
  it("preserves HTTP status and server error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Sign in" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const error = await api("/api/session").catch((value) => value);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Sign in", status: 401 });
  });

  it("rejects a successful response with an invalid JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );

    await expect(api("/api/session")).rejects.toMatchObject({
      message: "Server returned an invalid response.",
      status: 200,
    });
  });
});
