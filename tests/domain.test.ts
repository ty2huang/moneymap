import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { applyCommand, received, outstanding } from "../src/domain/ledger";
import { aggregate, csv } from "../src/domain/analytics";
import { minor, decimal, netCost } from "../src/domain/money";
import { encrypt, decrypt, wrapKey, unwrapKey } from "../src/server/crypto";
import { fixture, expense, receipt, userId } from "./fixtures";
import type { Command } from "../src/domain/contracts";
describe("exact money", () => {
  it("round trips precision without floating point", () => {
    expect(minor("0.29")).toBe(29);
    expect(decimal(minor("-12.34"))).toBe("-12.34");
    expect(minor("100", "JPY")).toBe(100);
    expect(minor("1.234", "KWD")).toBe(1234);
  });
  it("rejects excessive precision and unsafe amounts", () => {
    expect(() => minor("1.001")).toThrow();
    expect(() => minor("9999999999999999")).toThrow();
  });
  it("applies the signed net cost formula", () => {
    expect(netCost(10000, 3000, "expense")).toBe(-7000);
    expect(netCost(-2000, 0, "expense")).toBe(2000);
    expect(netCost(1000, 0, "income")).toBe(1000);
  });
});
describe("financial workflows", () => {
  it("partial receipts settle one expense across months without double counting", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l), "USD", userId);
    const id = l.transactions[0].id;
    l = applyCommand(l, receipt(l, id), "USD", userId);
    expect(received(l, id)).toBe(1000);
    expect(outstanding(l, l.transactions[0])).toBe(2000);
    l = applyCommand(l, receipt(l, id, "20", "2026-03-01"), "USD", userId);
    expect(outstanding(l, l.transactions[0])).toBe(0);
    const r = aggregate(l, {
      from: "2026-01-01",
      to: "2026-03-31",
      group: "category",
      period: "month",
    });
    expect(r.spending).toBe(7000);
    expect(r.income).toBe(3000);
    expect(r.outflows).toBe(10000);
    expect(r.rows.find((r) => r.period === "2026-02")?.income).toBe(1000);
  });
  it("one receipt allocates across several expenses", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l), "USD", userId);
    l = applyCommand(l, expense(l), "USD", userId);
    const c = receipt(l, l.transactions[0].id) as Extract<
      Command,
      { type: "transaction.save" }
    >;
    c.data.allocations.push({ expenseId: l.transactions[1].id, amount: "15" });
    l = applyCommand(l, c, "USD", userId);
    expect(l.transactions[2].amount).toBe(2500);
  });
  it("rejects overpayment, duplicate allocations, early dates, and foreign references", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l), "USD", userId);
    const id = l.transactions[0].id;
    expect(() => applyCommand(l, receipt(l, id, "31"), "USD", userId)).toThrow(
      /outstanding/,
    );
    expect(() =>
      applyCommand(l, receipt(l, id, "10", "2025-01-01"), "USD", userId),
    ).toThrow(/precede/);
    expect(() =>
      applyCommand(l, receipt(l, crypto.randomUUID()), "USD", userId),
    ).toThrow();
    const c = receipt(l, id) as Extract<Command, { type: "transaction.save" }>;
    c.data.allocations.push({ ...c.data.allocations[0] });
    expect(() => applyCommand(l, c, "USD", userId)).toThrow(/once/);
  });
  it("receipt deletion restores balances; paid expenses cannot be deleted", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l), "USD", userId);
    const e = l.transactions[0];
    l = applyCommand(l, receipt(l, e.id), "USD", userId);
    expect(() =>
      applyCommand(
        l,
        { type: "transaction.delete", data: { id: e.id, version: 1 } },
        "USD",
        userId,
      ),
    ).toThrow();
    l = applyCommand(
      l,
      {
        type: "transaction.delete",
        data: { id: l.transactions[1].id, version: 1 },
      },
      "USD",
      userId,
    );
    expect(outstanding(l, e)).toBe(3000);
  });
  it("blocks expense changes invalidating receipts", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l), "USD", userId);
    const id = l.transactions[0].id;
    l = applyCommand(l, receipt(l, id), "USD", userId);
    const c = expense(l) as Extract<Command, { type: "transaction.save" }>;
    c.data = { ...c.data, id, version: 1, reimbursable: "5" };
    expect(() => applyCommand(l, c, "USD", userId)).toThrow(/invalidate/);
  });
  it("merchant returns reduce spending in the return period", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l, "-20", "0", "2026-02-01"), "USD", userId);
    expect(
      aggregate(l, {
        from: "2026-02-01",
        to: "2026-02-28",
        period: "month",
        group: "category",
      }).spending,
    ).toBe(-2000);
  });
  it("excludes transfers and blocks same-account transfers", () => {
    let l = fixture().ledger;
    l = applyCommand(
      l,
      {
        type: "account.save",
        data: {
          name: "Card",
          bankName: "Demo",
          type: "credit_card",
          archived: false,
        },
      },
      "USD",
      userId,
    );
    const c: Command = {
      type: "transfer.save",
      data: {
        date: "2026-01-01",
        sourceId: l.accounts[0].id,
        destinationId: l.accounts[1].id,
        amount: "500",
        description: "Card payment",
        comments: "",
      },
    };
    l = applyCommand(l, c, "USD", userId);
    expect(
      aggregate(l, {
        from: "2026-01-01",
        to: "2026-12-31",
        period: "month",
        group: "category",
      }).outflows,
    ).toBe(0);
    c.data.destinationId = c.data.sourceId;
    expect(() => applyCommand(l, c, "USD", userId)).toThrow(/different/);
  });
  it("rejects stale versions and used account deletion", () => {
    let l = fixture().ledger;
    l = applyCommand(l, expense(l), "USD", userId);
    expect(() =>
      applyCommand(
        l,
        { type: "account.delete", data: { id: l.accounts[0].id, version: 2 } },
        "USD",
        userId,
      ),
    ).toThrow(/changed/);
    expect(() =>
      applyCommand(
        l,
        { type: "account.delete", data: { id: l.accounts[0].id, version: 1 } },
        "USD",
        userId,
      ),
    ).toThrow(/used/);
  });
  it("locks builtins but allows household visibility changes", () => {
    let l = fixture().ledger;
    const c = l.categories[0];
    expect(() =>
      applyCommand(
        l,
        { type: "category.delete", data: { id: c.id, version: c.version } },
        "USD",
        userId,
      ),
    ).toThrow(/Prebuilt/);
    const { builtin: _, ...data } = c;
    l = applyCommand(
      l,
      { type: "category.save", data: { ...data, hidden: true } },
      "USD",
      userId,
    );
    expect(l.categories[0].hidden).toBe(true);
    expect(() =>
      applyCommand(
        l,
        {
          type: "category.save",
          data: { ...data, name: "Renamed", version: 2 },
        },
        "USD",
        userId,
      ),
    ).toThrow(/Prebuilt/);
  });
  it("fills empty periods and enforces calendar validation", () => {
    const r = aggregate(fixture().ledger, {
      from: "2026-01-01",
      to: "2026-03-31",
      period: "month",
      group: "category",
    });
    expect(r.periods).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(() =>
      aggregate(fixture().ledger, {
        from: "2026-02-30",
        to: "2026-03-31",
        period: "month",
        group: "category",
      }),
    ).toThrow();
  });
  it("neutralizes formulas in CSV text while preserving numeric negatives", () => {
    expect(csv([["=SUM(A1)", -20, '"hi"']])).toBe(
      '"\'=SUM(A1)","-20","""hi"""',
    );
  });
});
describe("field encryption", () => {
  it("encrypts differently each time and binds ciphertext to context", () => {
    const key = randomBytes(32),
      context = "household:record:description",
      encrypted = encrypt("Private text", key, context);
    expect(encrypted).not.toContain("Private");
    expect(encrypted).not.toBe(encrypt("Private text", key, context));
    expect(decrypt(encrypted, key, context)).toBe("Private text");
    expect(() => decrypt(encrypted, key, "another household")).toThrow();
    expect(() => decrypt(encrypted, randomBytes(32), context)).toThrow();
    const parts = encrypted.split(".");
    parts[2] = "AA" + parts[2].slice(2);
    expect(() => decrypt(parts.join("."), key, context)).toThrow();
  });
  it("rewraps keys while retaining access to old versions", () => {
    process.env.MONEYMAP_MASTER_KEYS = JSON.stringify({
      "1": randomBytes(32).toString("base64"),
      "2": randomBytes(32).toString("base64"),
    });
    process.env.MONEYMAP_ACTIVE_KEY_VERSION = "1";
    const k = randomBytes(32),
      w = wrapKey(k, "h");
    process.env.MONEYMAP_ACTIVE_KEY_VERSION = "2";
    const next = wrapKey(unwrapKey(w, "h"), "h");
    expect(unwrapKey(next, "h")).toEqual(k);
    expect(unwrapKey(w, "h")).toEqual(k);
  });
});
