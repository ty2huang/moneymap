import { aggregate, csv } from "@/domain/analytics";
import { reportInput, commandSchema, type Command } from "@/domain/contracts";
import { decimal, netCost } from "@/domain/money";
import { received, outstanding } from "@/domain/ledger";
import { ensure } from "@/domain/types";
import { snapshot, mutate } from "./ledger-service";
import type { Principal } from "./auth";
export async function readResource(
  p: Principal,
  resource: string,
  params: Record<string, string> = {},
  recordId?: string,
) {
  const s = await snapshot(p),
    currency = s.household.currency,
    l = s.ledger;
  ensure(
    !recordId ||
      ["accounts", "categories", "transactions", "transfers"].includes(
        resource,
      ),
    "Resource not found.",
    "NOT_FOUND",
    404,
  );
  if (resource === "analytics") {
    const report = aggregate(
      l,
      reportInput.parse(params),
      s.household.revision,
    );
    return {
      ...report,
      currency,
      income: decimal(report.income, currency),
      outflows: decimal(report.outflows, currency),
      spending: decimal(report.spending, currency),
      cashflow: decimal(report.cashflow, currency),
      rows: report.rows.map((r) => ({
        ...r,
        income: decimal(r.income, currency),
        outflows: decimal(r.outflows, currency),
        spending: decimal(r.spending, currency),
      })),
    };
  }
  const page = Number(params.page ?? 1),
    pageSize = Number(params.pageSize ?? 50);
  ensure(
    Number.isInteger(page) &&
      page > 0 &&
      Number.isInteger(pageSize) &&
      pageSize > 0 &&
      pageSize <= 200,
    "Invalid pagination.",
  );
  const transactions = l.transactions
    .filter(
      (t) =>
        (!params.from || t.date >= params.from) &&
        (!params.to || t.date <= params.to) &&
        (!params.accountId || t.accountId === params.accountId) &&
        (!params.categoryId || t.categoryId === params.categoryId) &&
        (!params.subcategoryId || t.subcategoryId === params.subcategoryId) &&
        (!params.kind ||
          l.categories.find((c) => c.id === t.categoryId)?.kind ===
            params.kind) &&
        (!params.status ||
          (params.status === "outstanding"
            ? outstanding(l, t) > 0
            : params.status === "paid"
              ? t.reimbursable > 0 && outstanding(l, t) === 0
              : params.status === "partial"
                ? received(l, t.id) > 0 && outstanding(l, t) > 0
                : true)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const publicTransactions = transactions.map((t) => ({
    ...t,
    amount: decimal(t.amount, currency),
    reimbursable: decimal(t.reimbursable, currency),
    netCost: decimal(
      netCost(
        t.amount,
        t.reimbursable,
        l.categories.find((c) => c.id === t.categoryId)!.kind,
      ),
      currency,
    ),
    received: decimal(received(l, t.id), currency),
    outstanding: decimal(outstanding(l, t), currency),
    allocations: t.allocations.map((a) => ({
      ...a,
      amount: decimal(a.amount, currency),
    })),
  }));
  if (resource === "export")
    return csv([
      [
        "Date",
        "Category",
        "Subcategory",
        "Account",
        "Amount",
        "Reimbursable",
        "Net cost",
        "Description",
        "Comments",
      ],
      ...publicTransactions.map((t) => [
        t.date,
        l.categories.find((c) => c.id === t.categoryId)!.name,
        l.categories.find((c) => c.id === t.subcategoryId)?.name ?? "",
        l.accounts.find((a) => a.id === t.accountId)!.name,
        t.amount,
        t.reimbursable,
        t.netCost,
        t.description,
        t.comments,
      ]),
    ]);
  const data =
    resource === "transactions"
      ? publicTransactions
      : resource === "accounts"
        ? l.accounts
        : resource === "categories"
          ? l.categories
          : resource === "transfers"
            ? l.transfers
                .filter(
                  (t) =>
                    (!params.from || t.date >= params.from) &&
                    (!params.to || t.date <= params.to) &&
                    (!params.accountId ||
                      t.sourceId === params.accountId ||
                      t.destinationId === params.accountId),
                )
                .map((t) => ({ ...t, amount: decimal(t.amount, currency) }))
            : null;
  ensure(data, "Resource not found.", "NOT_FOUND", 404);
  if (recordId) {
    const record = data.find((x) => x.id === recordId);
    ensure(record, "Record not found.", "NOT_FOUND", 404);
    return { data: record, currency, revision: s.household.revision };
  }
  return {
    data: data.slice((page - 1) * pageSize, page * pageSize),
    total: data.length,
    page,
    pageSize,
    currency,
    revision: s.household.revision,
  };
}
export async function writeResource(
  p: Principal,
  resource: string,
  method: string,
  id: string | undefined,
  data: Record<string, unknown>,
  key?: string,
) {
  const names: Record<string, string> = {
    accounts: "account",
    categories: "category",
    transactions: "transaction",
    transfers: "transfer",
  };
  ensure(names[resource], "Resource not found.", "NOT_FOUND", 404);
  ensure(
    (method === "POST" && !id) ||
      ((method === "PATCH" || method === "DELETE") && id),
    "Invalid resource operation.",
  );
  ensure(!data.id || data.id === id, "Use the resource URL for record IDs.");
  const command = commandSchema.parse({
    type: `${names[resource]}.${method === "DELETE" ? "delete" : "save"}`,
    data: { ...data, ...(id ? { id } : {}) },
  });
  return mutate(p, command, key);
}
