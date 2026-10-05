import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import {
  createHousehold,
  requestJoin,
  householdAction,
  householdInfo,
} from "../src/server/household-service";
import { mutate, snapshot } from "../src/server/ledger-service";
import { connectionAction, consent } from "../src/server/connections";
import { databaseRpc } from "../src/server/database";
import { hash, unwrapKey, decrypt } from "../src/server/crypto";
import { execFileSync } from "node:child_process";
import { POST as mcpPost } from "../src/app/mcp/route";
import { GET as restGet } from "../src/app/api/v1/[...path]/route";
import { expense, receipt } from "./fixtures";

// These tests exercise database authorization without a Next request or a live
// OAuth provider. Provider failures and ordering have separate unit coverage.
vi.mock("../src/server/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/supabase")>()),
  supabaseServer: async () => ({
    auth: {
      oauth: {
        revokeGrant: async () => ({ data: {}, error: null }),
        getAuthorizationDetails: async () => ({
          data: { client: { id: "integration-consent-client" } },
          error: null,
        }),
        approveAuthorization: async () => ({
          data: { redirect_url: "https://client.example/callback" },
          error: null,
        }),
      },
    },
  }),
}));

const rpcMock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@supabase/server/core", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: unknown) => rpcMock.execute(name, args),
  }),
}));

function principal() {
  const userId = crypto.randomUUID();
  return { userId };
}

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  "PostgreSQL integration — isolated moneymap_test only",
  () => {
    let admin: ReturnType<typeof postgres>;
    const owner = principal(),
      other = principal(),
      joiner = principal();
    beforeAll(async () => {
      if (!url || new URL(url).pathname !== "/moneymap_test") {
        throw new Error("Tests require dedicated database named moneymap_test");
      }
      vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_server_credential");
      admin = postgres(url, { max: 2, onnotice: () => {} });
      await admin`drop schema if exists webapp cascade`;
      await admin`drop function if exists public.moneymap(text,jsonb)`;
      // Standalone PostgreSQL supplies the same claims interface as PostgREST.
      await admin.unsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
        END $$;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
          SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
        $$;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(auth.jwt()->>'sub','')::uuid
        $$;
      `);
      rpcMock.execute.mockImplementation(async (_name, args) => {
        try {
          const data = await admin.begin(async (tx) => {
            await tx`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
            await tx.unsafe("SET LOCAL ROLE service_role");
            const [row] =
              await tx`select public.moneymap(${args.operation}, ${tx.json(args.payload)}::jsonb) as data`;
            return row.data;
          });
          return { data, error: null };
        } catch (error) {
          const e = error as {
            code: string;
            detail: string;
            message: string;
            where?: string;
          };
          return {
            data: null,
            error: { code: e.code, details: e.detail, message: e.message },
          };
        }
      });
      for (const name of (await readdir("supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        await admin.unsafe(
          await readFile("supabase/migrations/" + name, "utf8"),
        );
      }
      // Hosted Supabase keeps auth schema usage private to platform roles.
      await admin.unsafe("REVOKE ALL ON SCHEMA auth FROM moneymap_app");
      process.env.MONEYMAP_MASTER_KEYS = JSON.stringify({
        "1": randomBytes(32).toString("base64"),
      });
      process.env.MONEYMAP_ACTIVE_KEY_VERSION = "1";
      process.env.APP_URL = "http://localhost:3000";
      await createHousehold(owner, {
        currency: "USD",
      });
      await createHousehold(other, {
        currency: "USD",
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
      vi.unstubAllEnvs();
    });
    it("isolates households and encrypts persisted labels", async () => {
      const s = await snapshot(owner);
      expect((await snapshot(other)).ledger.accounts).toHaveLength(0);
      const rows = await admin`select name from webapp.accounts`;
      expect(rows[0].name).not.toContain("Secret");
      expect(s.ledger.accounts[0].name).toBe("Secret checking");
      await admin.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE moneymap_app");
        await tx`select set_config('app.user_id', ${other.userId}, true)`;
        await tx`select set_config('app.household_id', ${(await snapshot(other)).household.id}, true)`;
        expect(await tx`select * from webapp.accounts`).toHaveLength(0);
      });
    });
    it("requires server credentials, a verified actor, and keeps tables private", async () => {
      const [role] = await admin`
        select p.prosecdef, pg_get_userbyid(p.proowner) as owner, r.rolbypassrls
        from pg_proc p join pg_roles r on r.oid=p.proowner
        where p.oid='public.moneymap(text,jsonb)'::regprocedure
      `;
      expect(role).toEqual({
        prosecdef: true,
        owner: "moneymap_app",
        rolbypassrls: false,
      });
      await expect(
        databaseRpc(undefined, "snapshot", { user_id: owner.userId }),
      ).rejects.toThrow(/Sign in/);
      for (const apiRole of ["anon", "authenticated"]) {
        await expect(
          admin.begin(async (tx) => {
            await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner.userId, role: apiRole })}, true)`;
            await tx.unsafe(`SET LOCAL ROLE ${apiRole}`);
            return tx`select public.moneymap('snapshot', ${tx.json({ user_id: owner.userId })}::jsonb)`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
      }
      const own = await snapshot(owner);
      const result = await databaseRpc<{ household: { id: string } }>(
        other,
        "snapshot",
        {
          user_id: owner.userId,
          household_id: own.household.id,
        },
      );
      expect(result.household.id).not.toBe(own.household.id);
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE authenticated");
          return tx`select * from webapp.accounts`;
        }),
      ).rejects.toMatchObject({ code: "42501" });
    });
    it("rolls back stale and invalid saves without changing revision or audit", async () => {
      const stored = await databaseRpc<{
        household: { id: string; revision: number };
        ledger: Record<string, unknown>;
      }>(owner, "snapshot");
      const payload = {
        household_id: stored.household.id,
        expected_revision: stored.household.revision - 1,
        ledger: stored.ledger,
        action: "account.save",
        record_id: crypto.randomUUID(),
      };
      await expect(
        databaseRpc(owner, "save_ledger", payload),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      await expect(
        databaseRpc(owner, "save_ledger", {
          ...payload,
          expected_revision: stored.household.revision,
          ledger: {
            ...stored.ledger,
            accounts: [{ id: crypto.randomUUID(), name: "Invalid" }],
          },
        }),
      ).rejects.toBeTruthy();
      expect(await databaseRpc(owner, "snapshot")).toEqual(stored);
      const [audit] =
        await admin`select count(*)::int as n from webapp.audit where "householdId"=${stored.household.id}`;
      expect(audit.n).toBe(1);
    });
    it("blocks membership changes during OAuth and recovers expired leases", async () => {
      const actor = principal();
      await createHousehold(actor, { currency: "USD" });
      const first = await databaseRpc<{ leaseId: string }>(
        actor,
        "oauth_begin",
      );
      await expect(
        householdAction(actor, { action: "leave" }),
      ).rejects.toMatchObject({ code: "OAUTH_BUSY" });
      await expect(databaseRpc(actor, "oauth_begin")).rejects.toMatchObject({
        code: "OAUTH_BUSY",
      });
      await admin`update webapp.http_oauth_leases set expires_at=now()+interval '10 seconds' where user_id=${actor.userId}`;
      await databaseRpc(actor, "oauth_renew", { lease_id: first.leaseId });
      const [renewed] =
        await admin`select expires_at > now()+interval '100 seconds' as extended from webapp.http_oauth_leases where user_id=${actor.userId}`;
      expect(renewed.extended).toBe(true);
      await admin`update webapp.http_oauth_leases set expires_at=now()-interval '1 second' where user_id=${actor.userId}`;
      await expect(
        databaseRpc(actor, "oauth_renew", { lease_id: first.leaseId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const second = await databaseRpc<{ leaseId: string }>(
        actor,
        "oauth_begin",
      );
      expect(second.leaseId).not.toBe(first.leaseId);
      await databaseRpc(actor, "oauth_end", { lease_id: first.leaseId });
      await expect(
        householdAction(actor, { action: "leave" }),
      ).rejects.toMatchObject({ code: "OAUTH_BUSY" });
      await databaseRpc(actor, "oauth_end", { lease_id: second.leaseId });
      await expect(
        householdAction(actor, { action: "leave" }),
      ).resolves.toEqual({ ok: true });
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
    it("preserves unchanged allocation rows across unrelated edits and receipt changes", async () => {
      const actor = principal();
      const { id: householdId } = await createHousehold(actor, {
        currency: "USD",
      });
      await mutate(actor, {
        type: "account.save",
        data: {
          name: "Checking",
          bankName: "Bank",
          type: "checking",
          archived: false,
        },
      });
      let s = await snapshot(actor);
      await mutate(actor, expense(s.ledger, "100", "60"));
      s = await snapshot(actor);
      const expenseId = s.ledger.transactions[0].id;
      await mutate(actor, receipt(s.ledger, expenseId, "10"));
      await mutate(actor, receipt(s.ledger, expenseId, "15"));
      const allocations = () => admin`
        select "receiptId", "expenseId", amount::int, ctid::text, xmin::text
        from webapp.allocations where "householdId"=${householdId}
        order by "receiptId"
      `;
      const initial = await allocations();
      expect(initial).toHaveLength(2);

      s = await snapshot(actor);
      const account = s.ledger.accounts[0];
      await mutate(actor, {
        type: "account.save",
        data: { ...account, name: "Renamed" },
      });
      const storedExpense = s.ledger.transactions.find(
        (t) => t.id === expenseId,
      )!;
      const expenseEdit = expense(s.ledger, "120", "60");
      await mutate(actor, {
        ...expenseEdit,
        data: {
          ...expenseEdit.data,
          id: expenseId,
          version: storedExpense.version,
        },
      });
      expect(await allocations()).toEqual(initial);

      await mutate(actor, receipt(s.ledger, expenseId, "5"));
      const withNewReceipt = await allocations();
      expect(withNewReceipt).toHaveLength(3);
      expect(withNewReceipt).toEqual(expect.arrayContaining(initial));

      s = await snapshot(actor);
      const editedId = initial[0].receiptId;
      const storedReceipt = s.ledger.transactions.find(
        (t) => t.id === editedId,
      )!;
      const receiptEdit = receipt(s.ledger, expenseId, "20");
      await mutate(actor, {
        ...receiptEdit,
        data: {
          ...receiptEdit.data,
          id: editedId,
          version: storedReceipt.version,
        },
      });
      const unchanged = withNewReceipt.filter((a) => a.receiptId !== editedId);
      const edited = await allocations();
      expect(edited).toHaveLength(3);
      expect(edited).toEqual(expect.arrayContaining(unchanged));
      const changed = edited.find((a) => a.receiptId === editedId)!;
      expect(changed.amount).toBe(2000);
      expect(changed.xmin).not.toBe(initial[0].xmin);

      s = await snapshot(actor);
      await mutate(actor, {
        type: "transaction.delete",
        data: {
          id: editedId,
          version: s.ledger.transactions.find((t) => t.id === editedId)!
            .version,
        },
      });
      expect(await allocations()).toEqual(unchanged);
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
      const p = {
        userId: owner.userId,
        tokenId: token.id,
        householdId: token.householdId,
        tokenHash: hash(result.token),
      };
      expect((await snapshot(p)).ledger.accounts).toHaveLength(1);
      await expect(
        mutate(p, expense((await snapshot(owner)).ledger)),
      ).rejects.toThrow(/permission|expired|revoked/);
      await connectionAction(owner, { action: "revoke-token", id: token.id });
      await expect(snapshot(p)).rejects.toThrow(/permission|expired|revoked/);
    });
    it("revalidates token expiry on reads and writes", async () => {
      const result = (await connectionAction(owner, {
        action: "create-token",
        name: "Expiring",
        permission: "write",
        days: 1,
      })) as { token: string };
      const tokenHash = hash(result.token);
      const p = { userId: owner.userId, tokenHash };
      await expect(snapshot(p)).resolves.toHaveProperty("ledger");
      await admin`update webapp.tokens set "expiresAt"=now()-interval '1 second' where hash=${tokenHash}`;
      await expect(snapshot(p)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        mutate(p, expense((await snapshot(owner)).ledger)),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
    it("lets former members request fresh approval after removal or leaving", async () => {
      const host = principal();
      const guest = principal();
      const { id: householdId } = await createHousehold(host, {
        currency: "USD",
      });

      const join = async () => {
        const invite = (await householdAction(host, { action: "invite" })) as {
          url: string;
        };
        const request = await requestJoin(guest, {
          token: new URL(invite.url).searchParams.get("invite"),
        });
        await expect(snapshot(guest)).rejects.toThrow(/join/);
        expect(
          (await householdInfo(host)).requests.find((r) => r.id === request.id)
            ?.status,
        ).toBe("pending");
        await householdAction(host, {
          action: "approve",
          id: String(request.id),
        });
        expect((await snapshot(guest)).household.id).toBe(householdId);
      };

      await join();
      await householdAction(host, { action: "remove", id: guest.userId });
      await join();
      await householdAction(guest, { action: "leave" });
      await join();
    });
    it("records the actual record IDs for create, edit, and delete audits", async () => {
      const actor = principal();
      const { id: householdId } = await createHousehold(actor, {
        currency: "USD",
      });
      for (const name of ["Checking", "Savings"]) {
        await mutate(actor, {
          type: "account.save",
          data: { name, bankName: "Bank", type: "checking", archived: false },
        });
      }
      await mutate(actor, {
        type: "category.save",
        data: {
          name: "Custom",
          kind: "expense",
          parentId: null,
          hidden: false,
        },
      });
      let s = await snapshot(actor);
      await mutate(actor, expense(s.ledger));
      await mutate(actor, {
        type: "transfer.save",
        data: {
          date: "2026-01-10",
          sourceId: s.ledger.accounts[0].id,
          destinationId: s.ledger.accounts[1].id,
          amount: "10",
          description: "",
          comments: "",
        },
      });
      s = await snapshot(actor);
      const created = await admin`
        select action, "recordId" from webapp.audit
        where "householdId"=${householdId}
      `;
      expect(created).toHaveLength(5);
      expect(created).toEqual(
        expect.arrayContaining([
          ...s.ledger.accounts.map((a) => ({
            action: "account.save",
            recordId: a.id,
          })),
          {
            action: "category.save",
            recordId: s.ledger.categories.find((c) => !c.builtin)!.id,
          },
          { action: "transaction.save", recordId: s.ledger.transactions[0].id },
          { action: "transfer.save", recordId: s.ledger.transfers[0].id },
        ]),
      );

      const transfer = s.ledger.transfers[0];
      await mutate(actor, {
        type: "transfer.delete",
        data: { id: transfer.id, version: transfer.version },
      });
      const account = s.ledger.accounts[0];
      await mutate(actor, {
        type: "account.save",
        data: {
          id: account.id,
          version: account.version,
          name: "Renamed",
          bankName: account.bankName,
          type: account.type,
          archived: account.archived,
        },
      });
      const audits = await admin`
        select action, "recordId" from webapp.audit
        where "householdId"=${householdId}
      `;
      expect(audits).toHaveLength(7);
      expect(
        audits.filter(
          (a) => a.action === "account.save" && a.recordId === account.id,
        ),
      ).toHaveLength(2);
      expect(audits).toContainEqual({
        action: "transfer.delete",
        recordId: transfer.id,
      });
    });
    it("persists a successful provider consent through the real RPC boundary", async () => {
      const actor = principal();
      const { id: householdId } = await createHousehold(actor, {
        currency: "USD",
      });
      await expect(
        consent(actor, {
          authorizationId: "authorization",
          decision: "approve",
          permission: "read",
        }),
      ).resolves.toEqual({ redirect_url: "https://client.example/callback" });
      const [grant] =
        await admin`select "clientId", permission, revoked from webapp.grants where "householdId"=${householdId} and "userId"=${actor.userId}`;
      expect(grant).toEqual({
        clientId: "integration-consent-client",
        permission: "read",
        revoked: false,
      });
      await expect(
        snapshot({ ...actor, clientId: grant.clientId }),
      ).resolves.toHaveProperty("household.id", householdId);
      await expect(
        databaseRpc({ ...actor, clientId: grant.clientId }, "household"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("OAuth grants enforce read/write and revocation", async () => {
      const s = await snapshot(owner),
        clientId = "test-client",
        id = crypto.randomUUID();
      await admin`insert into webapp.grants(id,"householdId","userId","clientId",permission) values(${id},${s.household.id},${owner.userId},${clientId},'read')`;
      const p = {
        ...owner,
        clientId,
      };
      await expect(mutate(p, expense(s.ledger))).rejects.toThrow(
        /permission|expired|revoked/,
      );
      await admin`update webapp.grants set permission='write' where id=${id}`;
      await mutate(p, expense(s.ledger, "7", "0"));
      await connectionAction(owner, { action: "revoke-grant", id });
      await expect(snapshot(p)).rejects.toThrow(/permission|expired|revoked/);
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
      const last = principal();
      const pending = principal();
      const { id: h } = await createHousehold(last, {
        currency: "USD",
      });
      for (const name of ["Checking", "Savings"]) {
        await mutate(last, {
          type: "account.save",
          data: {
            name,
            bankName: "Bank",
            type: "checking",
            archived: false,
          },
        });
      }
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
      for (const table of scopedTables) {
        expect(
          await admin`select * from ${admin("webapp." + table)} where "householdId"=${h}`,
          table,
        ).toHaveLength(0);
      }
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
        }),
      ).resolves.toHaveProperty("id");
    });
    it("serializes simultaneous owner departures and deletes the empty household", async () => {
      const a = principal(),
        b = principal();
      const { id: h } = await createHousehold(a, {
        currency: "USD",
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
        if (!/^moneymap-test[-a-z0-9]*$/.test(container)) {
          throw new Error(
            "Only a dedicated MoneyMap test container is allowed",
          );
        }
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
