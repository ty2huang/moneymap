import { test, expect } from "@playwright/test";

test("city suggestions start after two letters and submit the selected timezone", async ({
  page,
}) => {
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
  const city = page.getByRole("combobox", { name: "City", exact: true });
  await city.fill("H");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await city.fill("Ha");
  await expect(
    page.getByRole("option", { name: "Havana, Cuba", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/onboarding-city-suggestions.png",
    fullPage: true,
  });
  await page.getByRole("option", { name: "Havana, Cuba", exact: true }).click();
  await expect(city).toHaveValue("Havana, Cuba");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await city.fill("zzzz");
  await expect(page.getByRole("status")).toHaveText(
    "No cities found. Try another city name.",
  );
  await page
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  expect(submitted).toBeUndefined();
  await city.fill("to");
  await expect(
    page.getByRole("option", { name: "Toronto, Canada", exact: true }),
  ).toBeVisible();
  await city.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await city.fill("Hav");
  await city.press("ArrowDown");
  await city.press("Enter");
  await expect(city).toHaveValue("Havana, Cuba");
  expect(submitted).toBeUndefined();
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
      data: { currency: "USD", timezone: "America/Havana" },
    });
  expect(errors).toEqual([]);
});
