import { commandSchema, type Command } from "./contracts";
import { minor } from "./money";
import { ensure, type Ledger, type Transaction } from "./types";
export function received(
  ledger: Ledger,
  expenseId: string,
  excluding?: string,
) {
  return ledger.transactions
    .filter((t) => t.id !== excluding)
    .flatMap((t) => t.allocations)
    .filter((a) => a.expenseId === expenseId)
    .reduce((n, a) => n + a.amount, 0);
}
export function outstanding(ledger: Ledger, t: Transaction) {
  return Math.max(0, t.reimbursable - received(ledger, t.id));
}
export function isReceipt(
  ledger: Ledger,
  t: Pick<Transaction, "subcategoryId">,
) {
  return ledger.categories.some(
    (c) =>
      c.id === t.subcategoryId &&
      c.builtin &&
      c.name === "Refund" &&
      c.kind === "income",
  );
}
export function applyCommand(
  original: Ledger,
  raw: Command,
  currency: string,
  userId: string,
  newRecordId: string = crypto.randomUUID(),
): Ledger {
  const command = commandSchema.parse(raw),
    s = structuredClone(original),
    d = command.data;
  const resource = command.type.split(".")[0] as
    "account" | "category" | "transaction" | "transfer";
  const list =
    resource === "account"
      ? s.accounts
      : resource === "category"
        ? s.categories
        : resource === "transaction"
          ? s.transactions
          : s.transfers;
  const old = d.id ? list.find((x) => x.id === d.id) : undefined;
  if (d.id) {
    ensure(old, "Record not found", "NOT_FOUND", 404);
    ensure(
      d.version === old.version,
      "This record changed. Reload and reapply your edit.",
      "CONFLICT",
      409,
    );
  }
  if (command.type.endsWith(".delete")) {
    ensure(old, "Record not found", "NOT_FOUND", 404);
    if (resource === "account") {
      ensure(
        !s.transactions.some((t) => t.accountId === d.id) &&
          !s.transfers.some(
            (t) => t.sourceId === d.id || t.destinationId === d.id,
          ),
        "This account is used. Archive it instead.",
      );
    }
    if (resource === "category") {
      const c = s.categories.find((c) => c.id === d.id)!;
      ensure(!c.builtin, "Prebuilt categories cannot be removed.");
      ensure(
        !s.categories.some((c) => c.parentId === d.id) &&
          !s.transactions.some(
            (t) => t.categoryId === d.id || t.subcategoryId === d.id,
          ),
        "This category is used or has subcategories. Hide it instead.",
      );
    }
    if (resource === "transaction") {
      ensure(
        received(s, d.id!) === 0,
        "Remove reimbursement allocations before deleting this expense.",
      );
    }
    list.splice(
      list.findIndex((x) => x.id === d.id),
      1,
    );
    return s;
  }
  const id = d.id ?? newRecordId,
    version = (old?.version ?? 0) + 1;
  const put = <T extends { id: string }>(items: T[], item: T) => {
    const at = items.findIndex((x) => x.id === item.id);
    if (at < 0) {
      items.push(item);
    } else {
      items[at] = item;
    }
  };
  if (command.type === "account.save") {
    put(s.accounts, { ...command.data, id, version });
  }
  if (command.type === "category.save") {
    const x = command.data,
      previous = s.categories.find((c) => c.id === id),
      parent = s.categories.find((c) => c.id === x.parentId);
    if (previous) {
      ensure(
        previous.kind === x.kind && previous.parentId === x.parentId,
        "Classification and parent cannot change.",
      );
      ensure(
        !previous.builtin || previous.name === x.name,
        "Prebuilt names cannot change.",
      );
    }
    if (x.parentId) {
      ensure(
        parent && !parent.parentId && parent.kind === x.kind,
        "Select a matching parent category.",
      );
    }
    ensure(
      !s.categories.some(
        (c) =>
          c.id !== id &&
          c.parentId === x.parentId &&
          c.name.toLowerCase() === x.name.toLowerCase(),
      ),
      "A category with this name already exists.",
    );
    put(s.categories, {
      ...x,
      id,
      version,
      builtin: previous?.builtin ?? false,
    });
  }
  if (command.type === "transaction.save") {
    const x = command.data,
      previous = s.transactions.find((t) => t.id === id),
      category = s.categories.find((c) => c.id === x.categoryId),
      sub = s.categories.find((c) => c.id === x.subcategoryId),
      account = s.accounts.find((a) => a.id === x.accountId);
    ensure(category && !category.parentId, "Select a category.");
    ensure(
      !x.subcategoryId || sub?.parentId === category.id,
      "Subcategory does not belong to category.",
    );
    ensure(account, "Account not found.");
    ensure(
      !account.archived || previous?.accountId === account.id,
      "Select an active account.",
    );
    ensure(
      !category.hidden || previous?.categoryId === category.id,
      "Select a visible category.",
    );
    ensure(
      !sub?.hidden || previous?.subcategoryId === sub.id,
      "Select a visible subcategory.",
    );
    let amount = minor(x.amount, currency);
    const reimbursable = minor(x.reimbursable, currency),
      allocations = x.allocations.map((a) => ({
        ...a,
        amount: minor(a.amount, currency),
      }));
    if (isReceipt(s, x)) {
      ensure(
        reimbursable === 0,
        "Refund receipts cannot themselves be reimbursable.",
      );
      ensure(
        allocations.length > 0,
        "Select at least one reimbursable expense.",
      );
      ensure(
        new Set(allocations.map((a) => a.expenseId)).size ===
          allocations.length,
        "An expense may appear only once.",
      );
      for (const a of allocations) {
        const expense = s.transactions.find((t) => t.id === a.expenseId);
        ensure(
          expense &&
            expense.id !== id &&
            s.categories.find((c) => c.id === expense.categoryId)?.kind ===
              "expense",
          "Select a household expense.",
        );
        ensure(expense.date <= x.date, "Receipt cannot precede the expense.");
        ensure(
          a.amount > 0 &&
            a.amount <= expense.reimbursable - received(s, expense.id, id),
          "Allocation exceeds the outstanding reimbursement.",
        );
      }
      amount = allocations.reduce((n, a) => n + a.amount, 0);
      ensure(
        Number.isSafeInteger(amount) && amount <= 1_000_000_000_000,
        "Receipt total is too large.",
      );
    } else {
      ensure(
        allocations.length === 0,
        "Only Income → Refund may contain allocations.",
      );
    }
    ensure(amount !== 0, "Amount cannot be zero.");
    ensure(
      Math.abs(reimbursable) <= Math.abs(amount) &&
        (reimbursable === 0 || Math.sign(reimbursable) === Math.sign(amount)),
      "Reimbursement must have the same sign and not exceed the amount.",
    );
    const paid = received(s, id);
    if (paid) {
      ensure(
        category.kind === "expense" && reimbursable >= paid,
        "This change would invalidate existing repayments.",
      );
      ensure(
        !s.transactions.some(
          (t) =>
            t.allocations.some((a) => a.expenseId === id) && t.date < x.date,
        ),
        "Expense cannot be dated after its receipt.",
      );
    }
    put(s.transactions, {
      ...x,
      id,
      version,
      amount,
      reimbursable,
      allocations,
      createdBy: previous?.createdBy ?? userId,
      updatedBy: userId,
    });
  }
  if (command.type === "transfer.save") {
    const x = command.data,
      previous = s.transfers.find((t) => t.id === id),
      amount = minor(x.amount, currency);
    ensure(amount > 0, "Transfer amount must be positive.");
    ensure(x.sourceId !== x.destinationId, "Select two different accounts.");
    for (const accountId of [x.sourceId, x.destinationId]) {
      const a = s.accounts.find((a) => a.id === accountId);
      ensure(a, "Account not found.");
      ensure(
        !a.archived ||
          previous?.sourceId === a.id ||
          previous?.destinationId === a.id,
        "Select active accounts.",
      );
    }
    put(s.transfers, {
      ...x,
      id,
      version,
      amount,
      createdBy: previous?.createdBy ?? userId,
      updatedBy: userId,
    });
  }
  return s;
}
