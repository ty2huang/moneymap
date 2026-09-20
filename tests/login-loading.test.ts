import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { MoneyMap } from "../src/components/money-map";
import { demoSnapshot } from "./fixtures";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: vi.fn() };
});

function renderApp(session: object, state: object) {
  vi.mocked(useQuery)
    .mockReturnValueOnce(session as ReturnType<typeof useQuery>)
    .mockReturnValueOnce(state as ReturnType<typeof useQuery>);
  return renderToStaticMarkup(createElement(MoneyMap));
}

const snapshot = demoSnapshot();
const signedIn = {
  isPending: false,
  data: {
    configured: true,
    userId: snapshot.member.userId,
    member: snapshot.member,
  },
};

describe("login loading screens", () => {
  beforeEach(() => vi.mocked(useQuery).mockReset());

  it("shows a loading status while checking the session", () => {
    const html = renderApp({ isPending: true }, { isPending: true });
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading MoneyMap…");
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("Sign in with Google");
  });

  it("does not show a failure or retry screen while opening the household", () => {
    const html = renderApp(signedIn, { isPending: true });
    expect(html).toContain('role="status"');
    expect(html).toContain("Opening your household…");
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("could not be loaded");
    expect(html).not.toContain('role="alert"');
  });

  it("still offers a retry when loading the household actually fails", () => {
    const html = renderApp(signedIn, {
      isPending: false,
      error: new Error("Temporary failure"),
    });
    expect(html).toContain("Your household could not be loaded.");
    expect(html).toContain("Try again");
    expect(html).toContain("Temporary failure");
    expect(html).not.toContain('role="status"');
  });
});
