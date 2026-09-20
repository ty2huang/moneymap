import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
let connection: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  connection ??= postgres(process.env.DATABASE_URL, { prepare: false, max: 5 });
  return drizzle(connection, { schema });
}
export type DB = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
  return db().transaction(async (tx) => {
    const [role] = await tx.execute(
      sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname=current_user`,
    );
    if (
      !role ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.rolname !== "moneymap_app"
    ) {
      throw new Error("DATABASE_URL must use the restricted moneymap_app role");
    }
    await tx.execute(sql`select set_config('app.user_id',${userId},true)`);
    return fn(tx);
  });
}
export async function setHousehold(tx: Tx, id: string) {
  await tx.execute(sql`select set_config('app.household_id',${id},true)`);
}

// Transaction-scoped locks coordinate provider operations across server instances.
export async function lockOAuthUser(tx: Tx, userId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(${userId}))`,
  );
}
