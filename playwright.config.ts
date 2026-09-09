import { defineConfig } from "@playwright/test";
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          "pnpm run start --hostname 127.0.0.1 --port 3100",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120000,
      },
  reporter: [["list"], ["html", { open: "never" }]],
});
