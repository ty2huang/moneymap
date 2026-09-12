import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { demoSnapshot } from "../fixtures";
import { aggregate } from "../../src/domain/analytics";
import { applyCommand } from "../../src/domain/ledger";
import type { ReportInput } from "../../src/domain/contracts";

function backend() {
  let snapshot = demoSnapshot(),
    fail = false,
    hold: (() => Promise<void>) | undefined;
  let reports = 0;
  return {
    get snapshot() {
      return snapshot;
    },
    get reports() {
      return reports;
    },
    setFail(v: boolean) {
      fail = v;
    },
    setHold(v: (() => Promise<void>) | undefined) {
      hold = v;
    },
    change() {
      snapshot = {
        ...snapshot,
        household: {
          ...snapshot.household,
          revision: snapshot.household.revision + 1,
        },
      };
    },
    async attach(context: BrowserContext) {
      await context.route("**/api/session", (route) =>
        route.fulfill({
          json: {
            configured: true,
            userId: snapshot.member.userId,
            member: snapshot.member,
          },
        }),
      );
      await context.route("**/api/household", (route) =>
        route.fulfill({
          json: {
            household: snapshot.household,
            member: snapshot.member,
            members: [snapshot.member],
            requests: [],
            invitations: [],
          },
        }),
      );
      await context.route("**/api/state*", async (route) => {
        const request = route.request();
        if (request.method() === "POST") {
          try {
            snapshot = {
              ...snapshot,
              ledger: applyCommand(
                snapshot.ledger,
                request.postDataJSON(),
                "USD",
                snapshot.member.userId,
              ),
              household: {
                ...snapshot.household,
                revision: snapshot.household.revision + 1,
              },
            };
            await route.fulfill({
              json: { revision: snapshot.household.revision },
            });
          } catch (e) {
            await route.fulfill({
              status: 400,
              json: { error: { message: (e as Error).message } },
            });
          }
          return;
        }
        const params = new URL(request.url()).searchParams;
        if (params.has("report")) {
          reports++;
          const captured = structuredClone(snapshot);
          if (hold) {
            await hold();
          }
          if (fail) {
            await route.fulfill({
              status: 500,
              json: { error: { message: "Temporary report failure" } },
            });
            return;
          }
          params.delete("report");
          await route.fulfill({
            json: aggregate(
              captured.ledger,
              Object.fromEntries(params) as ReportInput,
              captured.household.revision,
            ),
          });
        } else {
          await route.fulfill({ json: snapshot });
        }
      });
    },
  };
}

async function openDashboard(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Household overview" }),
  ).toBeVisible();
  await expect(page.getByText("Last refreshed")).toBeVisible();
}

test("Escape dismisses a dropdown before its transaction dialog", async ({
  page,
  context,
}) => {
  const b = backend();
  await b.attach(context);
  await openDashboard(page);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const category = dialog.getByRole("combobox", {
    name: "Category",
    exact: true,
  });
  await category.click();
  await expect
    .poll(() => category.evaluate((element) => element.matches(":open")))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => category.evaluate((element) => element.matches(":open")))
    .toBe(false);
  await category.click();
  await page.getByRole("option", { name: "Food", exact: true }).click();
  await expect(category.locator("option:checked")).toHaveText("Food");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("unconfigured installation clearly explains setup", async ({ page }) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.goto("/");
  await expect(page.getByText("Ready for your household")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Continue with Google/ }),
  ).toHaveCount(0);
});

test("dashboard, responsive layout, transaction entry and duplication", async ({
  page,
  context,
}) => {
  const b = backend();
  await b.attach(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openDashboard(page);
  await page
    .getByRole("combobox", { name: "Time range", exact: true })
    .selectOption("custom");
  await page.getByLabel("Start month", { exact: true }).fill("2026-01");
  await page.getByLabel("End month", { exact: true }).fill("2026-12");
  await expect(page.getByText("$4,510.00", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .first()
    .click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("12.34");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Drinks and snacks");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(
    page.getByText("Drinks and snacks", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Drinks and snacks" })
    .getByRole("button", { name: "Duplicate transaction" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Drinks and snacks",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Household overview" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("compact navigation and report ranges", async ({ page, context }) => {
  const b = backend();
  await b.attach(context);
  await page.setViewportSize({ width: 674, height: 794 });
  await openDashboard(page);
  await expect(
    page.getByRole("navigation", { name: "Workspace" }),
  ).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Time range", exact: true }),
  ).toHaveValue("last12");
  await expect(page.getByLabel("Start month")).toHaveCount(0);
  await expect(page.getByLabel("Breakdown", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Account", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Money out", { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-09-07T12:00:00Z"));
  await page
    .getByRole("combobox", { name: "Time range", exact: true })
    .selectOption("ytd");
  const [ytdRequest] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.url().includes("report=1") && r.url().includes("from=2026-01-01"),
    ),
    page.getByRole("button", { name: "Refresh", exact: true }).click(),
  ]);
  const ytd = new URL(ytdRequest.url()).searchParams;
  expect(ytd.get("to")).toBe("2026-09-07");
  await page
    .getByRole("combobox", { name: "Time range", exact: true })
    .selectOption("custom");
  await page.getByLabel("Start month").fill("2024-02");
  await page.getByLabel("End month").fill("2024-02");
  const [customRequest] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("to=2024-02-29")),
    page.getByRole("button", { name: "Refresh", exact: true }).click(),
  ]);
  expect(new URL(customRequest.url()).searchParams.get("from")).toBe(
    "2024-02-01",
  );
  await page
    .getByRole("combobox", { name: "Period", exact: true })
    .selectOption("year");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Workspace" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/navigation-tablet.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("combobox", { name: "Time range", exact: true })
    .selectOption("last12");
  await page.screenshot({ path: "test-results/dashboard-tablet.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "Time range", exact: true })
    .selectOption("custom");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-custom-mobile.png" });
});

test("focus and reconnect without changes keep the report current", async ({
  page,
  context,
}) => {
  const b = backend();
  await b.attach(context);
  await openDashboard(page);
  const initial = b.reports;
  for (const event of ["focus", "online"]) {
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/state")),
      page.evaluate((name) => window.dispatchEvent(new Event(name)), event),
    ]);
    await expect(
      page.getByText("Updates available", { exact: false }),
    ).toHaveCount(0);
    expect(b.reports).toBe(initial);
  }
});

test("explicit refresh, failure/retry, and change during refresh", async ({
  page,
  context,
}) => {
  const b = backend();
  await b.attach(context);
  await openDashboard(page);
  const initial = b.reports;
  b.change();
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); // query refetch detects newer household revision
  await expect(
    page.getByText("Updates available", { exact: false }),
  ).toBeVisible();
  expect(b.reports).toBe(initial);
  b.setFail(true);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary report failure" }),
  ).toContainText("Temporary report failure");
  await expect(
    page.getByText("Updates available", { exact: false }),
  ).toBeVisible();
  b.setFail(false);
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  b.setHold(() => wait);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refreshing…" }),
  ).toBeDisabled();
  b.change();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/state")),
    page.evaluate(() => window.dispatchEvent(new Event("focus"))),
  ]);
  release();
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Updates available", { exact: false }),
  ).toBeVisible();
  b.setHold(undefined);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Updates available", { exact: false }),
  ).toHaveCount(0);
});

test("two browsers recover shared changes without refreshing analytics automatically", async ({
  browser,
}) => {
  const b = backend(),
    a = await browser.newContext(),
    c = await browser.newContext();
  await b.attach(a);
  await b.attach(c);
  const first = await a.newPage(),
    second = await c.newPage();
  await openDashboard(first);
  await openDashboard(second);
  await first
    .getByRole("button", { name: "Transactions", exact: true })
    .click();
  await first
    .getByRole("button", { name: "Add transaction", exact: true })
    .first()
    .click();
  await first.getByLabel("Amount (USD)", { exact: true }).fill("8");
  await first.getByLabel("Description", { exact: true }).fill("Shared update");
  await first
    .getByRole("dialog")
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(first.getByText("Shared update", { exact: true })).toBeVisible();
  const before = b.reports;
  await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    second.getByText("Updates available", { exact: false }),
  ).toBeVisible();
  expect(b.reports).toBe(before);
  await second
    .getByRole("button", { name: "Transactions", exact: true })
    .click();
  await expect(
    second.getByText("Shared update", { exact: true }),
  ).toBeVisible();
  await a.close();
  await c.close();
});

test("account edits and immutable category visibility", async ({
  page,
  context,
}) => {
  const b = backend();
  await b.attach(context);
  await openDashboard(page);
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Edit Everyday checking" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Joint checking");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Joint checking", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Edit Food", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByLabel("Hide from new entries").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("expense · Hidden from new entries"),
  ).toBeVisible();
});

test("reimbursement receipt allocates the remaining balance", async ({
  page,
  context,
}) => {
  const b = backend();
  await b.attach(context);
  await openDashboard(page);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page
    .getByRole("button", { name: "Record reimbursement", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(/Shared groceries/)
    .fill("20");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record reimbursement", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Reimbursements", exact: true })
    .selectOption("paid");
  await expect(
    page.getByRole("table").getByText("Paid", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Shared groceries", { exact: true }),
  ).toBeVisible();
});
