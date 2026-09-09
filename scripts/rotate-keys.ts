import postgres from "postgres";
import { unwrapKey, wrapKey } from "../src/server/crypto";
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("DATABASE_ADMIN_URL required");
const db = postgres(process.env.DATABASE_ADMIN_URL, { max: 1 });
try {
  await db.begin(async (tx) => {
    const rows =
      await tx`select id,"wrappedKey" from webapp.households for update`;
    for (const row of rows)
      await tx`update webapp.households set "wrappedKey"=${wrapKey(unwrapKey(row.wrappedKey, row.id), row.id)} where id=${row.id}`;
    console.log("Rewrapped household keys: " + rows.length);
  });
} finally {
  await db.end();
}
