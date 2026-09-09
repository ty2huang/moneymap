import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import {
  createHousehold,
  requestJoin,
  householdAction,
  householdInfo,
} from "../src/server/household-service";
import { mutate, snapshot } from "../src/server/ledger-service";
import { connectionAction } from "../src/server/connections";
import { asUser, setHousehold } from "../src/server/database";
import { hash, unwrapKey, decrypt } from "../src/server/crypto";
import { execFileSync } from "node:child_process";
import { POST as mcpPost } from "../src/app/mcp/route";
import { GET as restGet } from "../src/app/api/v1/[...path]/route";
import * as tables from "../src/db/schema";
import { expense, receipt } from "./fixtures";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  "PostgreSQL integration — isolated moneymap_test only",
  () => {
    let admin: ReturnType<typeof postgres>;
    const owner = { userId: crypto.randomUUID() },
      other = { userId: crypto.randomUUID() },
      joiner = { userId: crypto.randomUUID() };
    beforeAll(async () => {
      if (!url || new URL(url).pathname !== "/moneymap_test")
        throw new Error("Tests require dedicated database named moneymap_test");
      admin = postgres(url, { max: 2 });
      await admin`drop schema if exists webapp cascade`;
      for (const name of (await readdir("supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await admin.unsafe(
          await readFile("supabase/migrations/" + name, "utf8"),
        );
      await admin`alter role moneymap_app login password 'local-test-role'`;
      const appURL = new URL(url);
      appURL.username = "moneymap_app";
      appURL.password = "local-test-role";
      process.env.DATABASE_URL = appURL.toString();
      process.env.MONEYMAP_MASTER_KEYS = JSON.stringify({
        "1": randomBytes(32).toString("base64"),
      });
      process.env.MONEYMAP_ACTIVE_KEY_VERSION = "1";
      process.env.APP_URL = "http://localhost:3000";
      await createHousehold(owner, {
        currency: "USD",
        timezone: "UTC",
      });
      await createHousehold(other, {
        currency: "USD",
        timezone: "UTC",
      });
      await mutate(owner, {
        type: "account.save",
        data: {
          name: "Secret checking",
          bankName: "Private bank",
          type: "checking",
          archived: false,
        },
      });
    });
    afterAll(async () => {
      await admin?.end();
    });
    it("isolates households and encrypts persisted labels", async () => {
      const s = await snapshot(owner);
      expect((await snapshot(other)).ledger.accounts).toHaveLength(0);
      const rows = await admin`select name from webapp.accounts`;
      expect(rows[0].name).not.toContain("Secret");
      expect(s.ledger.accounts[0].name).toBe("Secret checking");
      await asUser(other.userId, async (tx) => {
        const m = await tx
          .select()
          .from(tables.members)
          .where(eq(tables.members.userId, other.userId));
        await setHousehold(tx, m[0].householdId);
        expect(await tx.select().from(tables.accounts)).toHaveLength(0);
      });
    });
    it("enforces exact receipt balance and handles concurrent allocation attempts", async () => {
      let s = await snapshot(owner);
      await mutate(owner, expense(s.ledger));
      s = await snapshot(owner);
      const c = receipt(s.ledger, s.ledger.transactions[0].id, "20");
      const results = await Promise.allSettled([
        mutate(owner, c),
        mutate(owner, c),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      s = await snapshot(owner);
      expect(
        s.ledger.transactions.filter((t) => t.allocations.length),
      ).toHaveLength(1);
    });
    it("idempotent retries do not duplicate transactions and reject changed payloads", async () => {
      const s = await snapshot(owner),
        c = expense(s.ledger, "5", "0");
      await mutate(owner, c, "retry-one");
      const r = await mutate(owner, c, "retry-one");
      expect(r.replayed).toBe(true);
      expect(
        (await snapshot(owner)).ledger.transactions.filter(
          (t) => t.amount === 500,
        ),
      ).toHaveLength(1);
      await expect(
        mutate(owner, expense(s.ledger, "6", "0"), "retry-one"),
      ).rejects.toThrow(/different/);
    });
    it("database rejects cross-household account references", async () => {
      const a = await snapshot(owner),
        b = await snapshot(other);
      await expect(
        admin`insert into webapp.transactions(id,"householdId",date,"categoryId","accountId",amount,reimbursable,description,comments,"createdBy","updatedBy") values(${crypto.randomUUID()},${b.household.id},'2026-01-01',${b.ledger.categories[0].id},${a.ledger.accounts[0].id},100,0,'x','x',${other.userId},${other.userId})`,
      ).rejects.toMatchObject({ code: "23503" });
    });
    it("database guards prebuilt definitions and invalid receipt sums", async () => {
      const s = await snapshot(owner);
      await expect(
        admin`update webapp.categories set name='Tampered' where id=${s.ledger.categories[0].id}`,
      ).rejects.toMatchObject({ code: "23514" });
      const r = s.ledger.transactions.find((t) => t.allocations.length)!;
      await expect(
        admin`update webapp.transactions set amount=amount+1 where id=${r.id}`,
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("join requests require approval and membership removal immediately revokes access", async () => {
      const invite = (await householdAction(owner, { action: "invite" })) as {
        url: string;
      };
      await requestJoin(joiner, {
        token: new URL(invite.url).searchParams.get("invite"),
      });
      await expect(snapshot(joiner)).rejects.toThrow(/join/);
      const info = await householdInfo(owner);
      const r = info.requests.find((r) => r.userId === joiner.userId)!;
      await householdAction(owner, { action: "approve", id: r.id });
      expect((await snapshot(joiner)).household.id).toBe(info.household.id);
      await expect(householdAction(owner, { action: "leave" })).rejects.toThrow(
        /owner/,
      );
      await householdAction(owner, { action: "remove", id: joiner.userId });
      await expect(snapshot(joiner)).rejects.toThrow(/join/);
    });
    it("personal tokens are hashed, scoped, expiring and revocable", async () => {
      const result = (await connectionAction(owner, {
        action: "create-token",
        name: "Test",
        permission: "read",
        days: 1,
      })) as { token: string };
      const [token] =
        await admin`select * from webapp.tokens where hash=${hash(result.token)}`;
      expect(token.hash).not.toBe(result.token);
      const p = { ...owner, tokenId: token.id, householdId: token.householdId };
      expect((await snapshot(p)).ledger.accounts).toHaveLength(1);
      await expect(
        mutate(p, expense((await snapshot(owner)).ledger)),
      ).rejects.toThrow(/permission/);
      await connectionAction(owner, { action: "revoke-token", id: token.id });
      await expect(snapshot(p)).rejects.toThrow(/permission/);
    });
    it("OAuth grants enforce read/write and revocation", async () => {
      const s = await snapshot(owner),
        clientId = "test-client",
        id = crypto.randomUUID();
      await admin`insert into webapp.grants(id,"householdId","userId","clientId",permission) values(${id},${s.household.id},${owner.userId},${clientId},'read')`;
      const p = { ...owner, clientId };
      await expect(mutate(p, expense(s.ledger))).rejects.toThrow(/permission/);
      await admin`update webapp.grants set permission='write' where id=${id}`;
      await mutate(p, expense(s.ledger, "7", "0"));
      await connectionAction(owner, { action: "revoke-grant", id });
      await expect(snapshot(p)).rejects.toThrow(/permission/);
    });

    it("REST and MCP use the same permission-enforced financial services", async () => {
      const created = (await connectionAction(owner, {
        action: "create-token",
        name: "Integration transport",
        permission: "read",
        days: 1,
      })) as { token: string };
      const headers = {
        Authorization: "Bearer " + created.token,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      const response = await restGet(
        new Request("http://localhost:3000/api/v1/transactions", { headers }),
        { params: Promise.resolve({ path: ["transactions"] }) },
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.data[0].amount).toBe("string");
      const id = data.data[0].id;
      const single = await restGet(
        new Request("http://localhost:3000/api/v1/transactions/" + id, {
          headers,
        }),
        { params: Promise.resolve({ path: ["transactions", id] }) },
      );
      expect((await single.json()).data.id).toBe(id);
      const request = (body: unknown) =>
        new Request("http://localhost:3000/mcp", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      const result = await mcpPost(
        request({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "read_finances",
            arguments: { resource: "accounts" },
          },
        }),
      );
      expect(result.status).toBe(200);
      const value = await result.json();
      expect(JSON.parse(value.result.content[0].text).data[0].name).toBe(
        "Secret checking",
      );
      const denied = await mcpPost(
        request({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "write_finances",
            arguments: {
              command: expense((await snapshot(owner)).ledger),
              idempotencyKey: "mcp-denied",
            },
          },
        }),
      );
      expect((await denied.json()).result.isError).toBe(true);
      const missing = await mcpPost(
        new Request("http://localhost:3000/mcp", { method: "POST" }),
      );
      expect(missing.status).toBe(401);
      expect(missing.headers.get("www-authenticate")).toContain(
        "oauth-protected-resource",
      );
    });
    it("last member leaving deletes every household record and preserves other households", async () => {
      const last = { userId: crypto.randomUUID() };
      const pending = { userId: crypto.randomUUID() };
      const { id: h } = await createHousehold(last, {
        currency: "USD",
        timezone: "UTC",
      });
      for (const name of ["Checking", "Savings"])
        await mutate(last, {
          type: "account.save",
          data: {
            name,
            bankName: "Bank",
            type: "checking",
            archived: false,
          },
        });
      let s = await snapshot(last);
      await mutate(last, expense(s.ledger), "delete-test");
      s = await snapshot(last);
      await mutate(last, receipt(s.ledger, s.ledger.transactions[0].id, "20"));
      await mutate(last, {
        type: "transfer.save",
        data: {
          date: "2026-01-01",
          sourceId: s.ledger.accounts[0].id,
          destinationId: s.ledger.accounts[1].id,
          amount: "1",
          description: "Transfer",
          comments: "",
        },
      });
      const invite = (await householdAction(last, { action: "invite" })) as {
        url: string;
      };
      await requestJoin(pending, {
        token: new URL(invite.url).searchParams.get("invite"),
      });
      await connectionAction(last, {
        action: "create-token",
        name: "Delete token",
        permission: "read",
        days: 1,
      });
      await admin`insert into webapp.grants(id,"householdId","userId","clientId",permission) values(${crypto.randomUUID()},${h},${last.userId},'delete-client','read')`;
      const scopedTables = (
        await admin`
        select table_name from information_schema.columns
        where table_schema='webapp' and column_name='householdId'
      `
      ).map((r) => r.table_name as string);
      for (const table of scopedTables) {
        const [count] =
          await admin`select count(*)::int as n from ${admin("webapp." + table)} where "householdId"=${h}`;
        expect(count.n, `${table} fixture`).toBeGreaterThan(0);
      }
      await expect(
        admin`delete from webapp.categories where "householdId"=${h} and builtin`,
      ).rejects.toMatchObject({ code: "23514" });
      const untouched = await snapshot(other);
      await expect(householdAction(last, { action: "leave" })).resolves.toEqual(
        { ok: true },
      );
      expect(
        await admin`select id from webapp.households where id=${h}`,
      ).toHaveLength(0);
      for (const table of scopedTables)
        expect(
          await admin`select * from ${admin("webapp." + table)} where "householdId"=${h}`,
          table,
        ).toHaveLength(0);
      await expect(snapshot(last)).rejects.toThrow(/join/);
      expect(await snapshot(other)).toEqual(untouched);
      await expect(
        requestJoin(pending, {
          token: new URL(invite.url).searchParams.get("invite"),
        }),
      ).rejects.toThrow(/invalid|expired/);
      await expect(
        createHousehold(last, {
          currency: "USD",
          timezone: "UTC",
        }),
      ).resolves.toHaveProperty("id");
    });
    it("serializes simultaneous owner departures and deletes the empty household", async () => {
      const a = { userId: crypto.randomUUID() },
        b = { userId: crypto.randomUUID() };
      const { id: h } = await createHousehold(a, {
        currency: "USD",
        timezone: "UTC",
      });
      await admin`insert into webapp.members("userId","householdId",role) values(${b.userId},${h},'owner')`;
      await expect(
        Promise.all([
          householdAction(a, { action: "leave" }),
          householdAction(b, { action: "leave" }),
        ]),
      ).resolves.toEqual([{ ok: true }, { ok: true }]);
      expect(
        await admin`select id from webapp.households where id=${h}`,
      ).toHaveLength(0);
      expect(
        await admin`select * from webapp.members where "householdId"=${h}`,
      ).toHaveLength(0);
    });
    it.skipIf(!process.env.TEST_DOCKER_CONTAINER)(
      "restores a database dump and decrypts fields with backed-up keys",
      async () => {
        const container = process.env.TEST_DOCKER_CONTAINER!;
        if (!/^moneymap-test[-a-z0-9]*$/.test(container))
          throw new Error(
            "Only a dedicated MoneyMap test container is allowed",
          );
        const run = (args: string[]) =>
          execFileSync("docker", ["exec", container, ...args], {
            stdio: "pipe",
          });
        run([
          "pg_dump",
          "-U",
          "postgres",
          "-d",
          "moneymap_test",
          "-Fc",
          "-f",
          "/tmp/moneymap-test.backup",
        ]);
        run(["dropdb", "-U", "postgres", "--if-exists", "moneymap_restore"]);
        run(["createdb", "-U", "postgres", "moneymap_restore"]);
        run([
          "pg_restore",
          "-U",
          "postgres",
          "-d",
          "moneymap_restore",
          "--no-owner",
          "/tmp/moneymap-test.backup",
        ]);
        const restoredURL = new URL(url!);
        restoredURL.pathname = "/moneymap_restore";
        const restored = postgres(restoredURL.toString(), { max: 1 });
        try {
          const source = await snapshot(owner);
          const [h] =
            await restored`select * from webapp.households where id=${source.household.id}`;
          const [account] =
            await restored`select * from webapp.accounts where "householdId"=${h.id}`;
          const key = unwrapKey(h.wrappedKey, h.id);
          expect(decrypt(account.name, key, `${h.id}:${account.id}:name`)).toBe(
            source.ledger.accounts[0].name,
          );
          const [count] =
            await restored`select count(*)::int as n from webapp.transactions where "householdId"=${h.id}`;
          expect(count.n).toBe(source.ledger.transactions.length);
          const a =
            await restored`select sum(amount)::text as total from webapp.allocations`;
          const b =
            await admin`select sum(amount)::text as total from webapp.allocations`;
          expect(a[0].total).toBe(b[0].total);
        } finally {
          await restored.end();
        }
      },
    );
  },
);
