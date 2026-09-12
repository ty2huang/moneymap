import { emptyLedger } from "../src/domain/catalog";
import { applyCommand } from "../src/domain/ledger";
import type { Command } from "../src/domain/contracts";
import type { Ledger, Snapshot } from "../src/domain/types";
export const userId = "10000000-0000-4000-8000-000000000001";
export function fixture() {
  let l = emptyLedger();
  l = applyCommand(
    l,
    {
      type: "account.save",
      data: {
        name: "Everyday checking",
        bankName: "Demo Bank",
        type: "checking",
        archived: false,
      },
    },
    "USD",
    userId,
  );
  const food = l.categories.find((c) => c.name === "Food" && !c.parentId)!,
    income = l.categories.find((c) => c.name === "Income")!,
    refund = l.categories.find((c) => c.name === "Refund")!;
  return { ledger: l, food, income, refund, account: l.accounts[0] };
}
export function expense(
  l: Ledger,
  amount = "100",
  reimbursable = "30",
  date = "2026-01-10",
): Command {
  return {
    type: "transaction.save",
    data: {
      date,
      categoryId: l.categories.find((c) => c.name === "Food" && !c.parentId)!
        .id,
      subcategoryId: null,
      accountId: l.accounts[0].id,
      amount,
      reimbursable,
      description: "Shared groceries",
      comments: "Private note",
      allocations: [],
    },
  };
}
export function receipt(
  l: Ledger,
  expenseId: string,
  amount = "10",
  date = "2026-02-10",
): Command {
  return {
    type: "transaction.save",
    data: {
      date,
      categoryId: l.categories.find((c) => c.name === "Income")!.id,
      subcategoryId: l.categories.find((c) => c.name === "Refund")!.id,
      accountId: l.accounts[0].id,
      amount: "0",
      reimbursable: "0",
      description: "Reimbursement",
      comments: "",
      allocations: [{ expenseId, amount }],
    },
  };
}
export function demoSnapshot(): Snapshot {
  const f = fixture();
  let ledger = applyCommand(f.ledger, expense(f.ledger), "USD", userId);
  ledger = applyCommand(
    ledger,
    receipt(ledger, ledger.transactions[0].id),
    "USD",
    userId,
  );
  ledger = applyCommand(
    ledger,
    {
      type: "transaction.save",
      data: {
        date: "2026-01-01",
        categoryId: f.income.id,
        subcategoryId: null,
        accountId: f.account.id,
        amount: "4500",
        reimbursable: "0",
        description: "Salary",
        comments: "",
        allocations: [],
      },
    },
    "USD",
    userId,
  );
  return {
    household: {
      id: "20000000-0000-4000-8000-000000000001",
      currency: "USD",
      revision: 1,
    },
    member: {
      userId,
      householdId: "20000000-0000-4000-8000-000000000001",
      role: "owner",
    },
    ledger,
  };
}
