import { test, expect } from "@playwright/test";

test("creates a household with its selected currency", async ({ page }) => {
  await page.setViewportSize({ width: 674, height: 794 });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        configured: true,
        userId: "onboarding-user",
        member: null,
        requests: [],
      },
    }),
  );
  let submitted: unknown;
  await page.route("**/api/household", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: {} });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("CAD");
  for (const title of ["Create a household", "Join a household"]) {
    const heading = page.getByRole("heading", { name: title, exact: true });
    const gap = await heading.evaluate((element) => {
      const form = element.nextElementSibling!;
      return (
        form.getBoundingClientRect().top -
        element.getBoundingClientRect().bottom
      );
    });
    expect(gap).toBeGreaterThanOrEqual(20);
  }
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await expect
    .poll(() => submitted)
    .toEqual({
      action: "create",
      data: { currency: "CAD" },
    });
  expect(errors).toEqual([]);
});

test("users without a household can retry a failed sign-out", async ({
  page,
}) => {
  let signedOut = false;
  let attempts = 0;
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "DELETE") {
      attempts++;
      if (attempts === 1) {
        await route.fulfill({
          status: 500,
          json: { error: { message: "Temporary sign-out failure" } },
        });
      } else {
        signedOut = true;
        await route.fulfill({ json: { ok: true } });
      }
      return;
    }
    await route.fulfill({
      json: signedOut
        ? { configured: true }
        : {
            configured: true,
            userId: "onboarding-user",
            member: null,
            requests: [{ id: "request", status: "pending" }],
          },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary sign-out failure" }),
  ).toHaveText("Temporary sign-out failure");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to MoneyMap" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});
