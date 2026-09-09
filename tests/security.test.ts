import { describe, it, expect } from "vitest";
import { safeReturnPath } from "../src/server/redirect";
import { authenticate, sameOrigin } from "../src/server/auth";
import { failure } from "../src/server/http";
describe("HTTP security boundaries", () => {
  it("keeps OAuth return paths within the app origin", () => {
    const origin = "https://money.example";
    expect(safeReturnPath("/oauth/consent?authorization_id=123", origin)).toBe(
      "/oauth/consent?authorization_id=123",
    );
    for (const path of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example/",
      "javascript:alert(1)",
    ])
      expect(safeReturnPath(path, origin)).toBe("/");
  });
  it("does not fall back to cookies for malformed Authorization headers", async () => {
    await expect(
      authenticate(
        new Request("https://money.example/api/state", {
          headers: { Authorization: "invalid" },
        }),
      ),
    ).rejects.toThrow("Invalid Authorization");
  });
  it("requires same-origin browser mutations", () => {
    process.env.APP_URL = "https://money.example";
    expect(() =>
      sameOrigin(
        new Request("https://money.example/api/state", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://money.example/api/state", {
          method: "POST",
          headers: { Origin: "https://money.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("does not expose database errors to clients", async () => {
    const result = await failure(
      new Error("Sensitive SQL and personal data"),
    ).json();
    expect(JSON.stringify(result)).not.toContain("Sensitive");
  });
});
