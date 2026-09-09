import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import postgres from "postgres";

const containerName = "moneymap-tests";

for (const file of [".env.local", ".env"])
  if (existsSync(file)) loadEnvFile(file);

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("Set TEST_DATABASE_URL in .env.local or the shell.");

async function isDatabaseReady() {
  const client = postgres(databaseUrl!, {
    max: 1,
    connect_timeout: 1,
    idle_timeout: 1,
  });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function waitForDatabase(attempts: number) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isDatabaseReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function docker(args: string[], capture = false) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

async function runTests() {
  const child = spawn(
    process.execPath,
    [resolve("node_modules", "vitest", "vitest.mjs"), "run", "tests/postgres.test.ts"],
    { stdio: "inherit", env: process.env },
  );
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  let stopContainer = false;
  if (!(await waitForDatabase(process.env.CI ? 20 : 2))) {
    if (process.env.CI)
      throw new Error("The CI PostgreSQL service did not become ready.");

    const url = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/moneymap_test" ||
      !url.port
    )
      throw new Error(
        "Automatic startup is restricted to a local moneymap_test database.",
      );

    const inspection = docker(
      ["inspect", "--format", "{{.State.Running}}", containerName],
      true,
    );
    if (inspection.status === 0) {
      if (inspection.stdout.trim() !== "true") {
        const started = docker(["start", containerName]);
        if (started.status !== 0) throw new Error("Could not start test database.");
        stopContainer = true;
      }
    } else {
      const started = docker([
        "run",
        "--detach",
        "--rm",
        "--name",
        containerName,
        "--env",
        `POSTGRES_PASSWORD=${decodeURIComponent(url.password)}`,
        "--env",
        `POSTGRES_DB=${url.pathname.slice(1)}`,
        "--publish",
        `127.0.0.1:${url.port}:5432`,
        "postgres:17-alpine",
      ]);
      if (started.status !== 0) throw new Error("Could not create test database.");
      stopContainer = true;
    }

    console.log("Waiting for the PostgreSQL integration database...");
    if (!(await waitForDatabase(60))) {
      if (stopContainer) docker(["stop", containerName]);
      throw new Error("The PostgreSQL integration database did not become ready.");
    }
  } else {
    console.log("Using the existing PostgreSQL integration database.");
  }

  try {
    process.exitCode = await runTests();
  } finally {
    if (stopContainer) {
      console.log("Stopping the PostgreSQL integration database...");
      docker(["stop", containerName]);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
