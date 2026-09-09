import { reportInput, type ReportInput } from "./contracts";
import { netCost } from "./money";
import type { Ledger } from "./types";
export type Report = {
  rows: {
    period: string;
    groupId: string;
    label: string;
    income: number;
    outflows: number;
    spending: number;
  }[];
  periods: string[];
  income: number;
  outflows: number;
  spending: number;
  cashflow: number;
  refreshedAt: string;
  revision: number;
};
export function aggregate(
  ledger: Ledger,
  raw: ReportInput,
  revision = 0,
): Report {
  const f = reportInput.parse(raw),
    periods: string[] = [];
  const cursor = new Date(f.from + "T00:00:00Z");
  cursor.setUTCDate(1);
  if (f.period === "year") cursor.setUTCMonth(0);
  while (cursor.toISOString().slice(0, 10) <= f.to) {
    periods.push(cursor.toISOString().slice(0, f.period === "year" ? 4 : 7));
    if (f.period === "year") cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const groups = new Map<string, Report["rows"][number]>();
  let income = 0,
    outflows = 0,
    spending = 0;
  for (const t of ledger.transactions) {
    if (
      t.date < f.from ||
      t.date > f.to ||
      (f.accountId && t.accountId !== f.accountId)
    )
      continue;
    const c = ledger.categories.find((c) => c.id === t.categoryId)!;
    const sub = ledger.categories.find((c) => c.id === t.subcategoryId);
    const groupId = f.group === "category" ? c.id : (sub?.id ?? c.id);
    const label =
      f.group === "category"
        ? c.name
        : `${c.name} / ${sub?.name ?? "Unspecified"}`;
    const period = t.date.slice(0, f.period === "year" ? 4 : 7),
      key = period + groupId;
    const row = groups.get(key) ?? {
      period,
      groupId,
      label,
      income: 0,
      outflows: 0,
      spending: 0,
    };
    if (c.kind === "income") {
      row.income += t.amount;
      income += t.amount;
    } else {
      row.outflows += t.amount;
      outflows += t.amount;
      const cost = -netCost(t.amount, t.reimbursable, c.kind);
      row.spending += cost;
      spending += cost;
    }
    groups.set(key, row);
  }
  return {
    rows: [...groups.values()],
    periods,
    income,
    outflows,
    spending,
    cashflow: income - outflows,
    revision,
    refreshedAt: new Date().toISOString(),
  };
}
export function csv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(
              typeof v === "string" &&
                /^[\s]*[=+\-@]/.test(v) &&
                !/^-?\d+(\.\d+)?$/.test(v)
                ? "'" + v
                : v,
            ).replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}
