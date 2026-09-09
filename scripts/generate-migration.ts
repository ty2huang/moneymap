import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const run = (command: string, args: string[]) => {
  const entryPoint =
    command === "drizzle-kit"
      ? resolve("node_modules", "drizzle-kit", "bin.cjs")
      : resolve("node_modules", "supabase", "dist", "supabase.js");
  const result = spawnSync(process.execPath, [entryPoint, ...args], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`);
};
const sqlFiles = async (directory: string) =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name);

async function main() {
  const [name, ...drizzleArgs] = process.argv
    .slice(2)
    .filter((argument) => argument !== "--");
  if (!name || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(name))
    throw new Error(
      "Pass a lowercase migration name, for example: pnpm db:generate add_accounts",
    );

  const beforeDrizzle = new Set(await sqlFiles("drizzle"));
  run("drizzle-kit", ["generate", `--name=${name}`, ...drizzleArgs]);
  const generated = (await sqlFiles("drizzle")).filter(
    (file) => !beforeDrizzle.has(file),
  );
  if (generated.length === 0) {
    console.log("No schema changes; no Supabase migration was created.");
    return;
  }
  if (generated.length !== 1)
    throw new Error(`Expected one Drizzle migration, found ${generated.length}`);

  const beforeSupabase = new Set(await sqlFiles("supabase/migrations"));
  run("supabase", ["migration", "new", name]);
  const created = (await sqlFiles("supabase/migrations")).filter(
    (file) => !beforeSupabase.has(file),
  );
  if (created.length !== 1)
    throw new Error(`Expected one Supabase migration, found ${created.length}`);

  const source = generated[0];
  const sql = await readFile(`drizzle/${source}`, "utf8");
  await writeFile(
    `supabase/migrations/${created[0]}`,
    `-- drizzle-source: ${source}\n${sql}`,
  );
  console.log(`Staged Drizzle migration as supabase/migrations/${created[0]}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
