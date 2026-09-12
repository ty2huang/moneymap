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
