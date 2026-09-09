"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Field, Select, ErrorMessage } from "./ui/fields";
import { MonthPicker } from "./ui/month-picker";
import { api, download } from "@/lib/client";
import type { Snapshot } from "@/domain/types";
import type { Report } from "@/domain/analytics";
import { csv } from "@/domain/analytics";
import { money, decimal, today, digits } from "@/domain/money";
import { monthEnd, reportRange, type ReportRange } from "@/domain/report-range";
export type Drill = {
  from: string;
  to: string;
  accountId?: string;
  categoryId?: string;
  subcategoryId?: string;
};
export function Dashboard({
  snapshot,
  eventCount,
  onDrill,
}: {
  snapshot: Snapshot;
  eventCount: number;
  onDrill: (d: Drill) => void;
}) {
  const { household, ledger } = snapshot;
  const [range, setRange] = useState<ReportRange>("last12");
  const [lastRefreshRange, setLastRefreshRange] =
    useState<ReportRange>("last12");
  const [filters, setFilters] = useState(() => ({
    ...reportRange("last12", today(household.timezone)),
    period: "month",
    group: "category",
    accountId: "",
  }));
  const [view, setView] = useState<"spending" | "cashflow">("spending");
  const [report, setReport] = useState<Report>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [loadedEvents, setLoadedEvents] = useState(-1),
    [reportFilters, setReportFilters] = useState(filters);
  const events = useRef(eventCount);
  events.current = eventCount;
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const requestId = useRef(0);
  const refresh = useCallback(async (f: typeof filters) => {
    const request = ++requestId.current,
      captured = events.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ report: "1", ...f });
      if (!f.accountId) params.delete("accountId");
      const result = await api<Report>("/api/state?" + params);
      if (request !== requestId.current) return;
      setReport(result);
      setReportFilters(f);
      setLastRefreshRange(rangeRef.current);
      setLoadedEvents(captured);
    } catch (e) {
      if (request === requestId.current) setError((e as Error).message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh(filters);
    return () => {
      requestId.current++;
    };
  }, [refresh]); // Filter changes are applied only when the user refreshes.
  const stale =
      !!report &&
      (loadedEvents !== eventCount || report.revision < household.revision),
    filtersChanged =
      range !== lastRefreshRange ||
      filters.from !== reportFilters.from ||
      filters.to !== reportFilters.to ||
      filters.period !== reportFilters.period ||
      filters.group !== reportFilters.group ||
      filters.accountId !== reportFilters.accountId,
    format = (n: number) => money(n, household.currency);
  const labels = [
    ...new Map(report?.rows.map((r) => [r.groupId, r.label]) ?? []).entries(),
  ];
  const colors = [
    "#b7ed9c",
    "#60bfa4",
    "#67a6b5",
    "#d7c789",
    "#a7a2d3",
    "#cf9d8c",
    "#769c70",
  ];
  const chart =
    report?.periods.map((period) => {
      const rows = report.rows.filter((r) => r.period === period);
      return {
        period,
        ...Object.fromEntries(
          labels.map(([id]) => [
            id,
            rows
              .filter((r) => r.groupId === id)
              .reduce(
                (n, r) =>
                  n +
                  (view === "spending" ? r.spending : r.income - r.outflows),
                0,
              ) /
              10 ** digits(household.currency),
          ]),
        ),
      };
    }) ?? [];
  const update = (field: string, value: string) =>
    setFilters((f) => ({ ...f, [field]: value }));
  function changeRange(value: ReportRange) {
    setRange(value);
    setFilters((f) => ({
      ...f,
      ...(value === "custom"
        ? { to: monthEnd(f.to.slice(0, 7)) }
        : reportRange(value, today(household.timezone))),
    }));
  }
  function changeMonth(field: "from" | "to", month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setFilters((f) => {
      const next = {
        ...f,
        [field]: field === "from" ? `${month}-01` : monthEnd(month),
      };
      if (next.from > next.to) {
        if (field === "from") next.to = monthEnd(month);
        else next.from = `${month}-01`;
      }
      return next;
    });
  }
  function drill(period: string, groupId: string) {
    const category = ledger.categories.find((c) => c.id === groupId);
    const start = period.length === 4 ? period + "-01-01" : period + "-01";
    const end =
      period.length === 4
        ? period + "-12-31"
        : new Date(
            Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0),
          )
            .toISOString()
            .slice(0, 10);
    onDrill({
      from: start < reportFilters.from ? reportFilters.from : start,
      to: end > reportFilters.to ? reportFilters.to : end,
      accountId: reportFilters.accountId || undefined,
      ...(category?.parentId
        ? { subcategoryId: groupId }
        : { categoryId: groupId }),
    });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[.2em] text-primary">
            The bigger picture
          </p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight">
            Household overview
          </h1>
          <p className="mb-0 text-sm text-muted-foreground">
            A little clarity for every dollar that comes and goes.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!report}
          onClick={() =>
            download(
              "moneymap-report.csv",
              csv([
                ["Period", "Category", "Income", "Outflows", "Spending"],
                ...(report?.rows ?? []).map((r) => [
                  r.period,
                  r.label,
                  decimal(r.income, household.currency),
                  decimal(r.outflows, household.currency),
                  decimal(r.spending, household.currency),
                ]),
              ]),
            )
          }
        >
          <Download size={15} />
          Export report
        </Button>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <Field label="Time range">
            <Select
              value={range}
              onChange={(e) => changeRange(e.target.value as ReportRange)}
            >
              <option value="last12">Last 12 Months</option>
              <option value="ytd">Year to Date</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="Period">
            <Select
              value={filters.period}
              onChange={(e) => update("period", e.target.value)}
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </Select>
          </Field>
          {range === "custom" && (
            <div className="col-span-2 grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <Field label="Start month">
                <MonthPicker
                  value={filters.from.slice(0, 7)}
                  onChange={(value) => changeMonth("from", value)}
                  aria-label="Start month"
                />
              </Field>
              <Field label="End month">
                <MonthPicker
                  value={filters.to.slice(0, 7)}
                  onChange={(value) => changeMonth("to", value)}
                  aria-label="End month"
                />
              </Field>
            </div>
          )}
          {filtersChanged && (
            <button
              type="button"
              className="col-span-2 mb-3 justify-self-end text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:mr-auto"
              onClick={() => {
                setRange(lastRefreshRange);
                setFilters(reportFilters);
              }}
            >
              Reset
            </button>
          )}
          <div className="col-span-2 flex flex-col items-end gap-1 sm:ml-auto">
            <div className="text-right text-xs text-muted-foreground">
              {report
                ? `Last refreshed ${new Date(report.refreshedAt).toLocaleTimeString()}`
                : "Your report will appear here."}
            </div>
            <div className="flex items-center gap-3">
              {stale && (
                <span role="status" className="text-xs text-primary">
                  ● Updates available
                </span>
              )}
              <Button
                variant="outline"
                onClick={() => void refresh(filters)}
                disabled={loading}
              >
                <RefreshCw
                  size={15}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>
        </div>
        <ErrorMessage message={error} />
      </Card>
      <div className="grid gap-3 min-[600px]:grid-cols-3">
        {[
          {
            label: "Money in",
            value: report?.income,
            icon: ArrowDownLeft,
            note: "Income, including repayments",
          },
          {
            label: "Money out",
            value: report?.spending,
            icon: ArrowUpRight,
            note: "Your household’s spending",
          },
          {
            label: "Net cashflow",
            value: report?.cashflow,
            icon: Wallet,
            note: "Income minus recorded outflows",
          },
        ].map(({ label, value, icon: Icon, note }, i) => (
          <Card
            key={label}
            className={`min-w-0 p-4 xl:p-6 ${i === 1 ? "border-primary/30" : ""}`}
          >
            <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
              {label}
              <Icon size={18} className={i === 1 ? "text-primary" : ""} />
            </div>
            <div className="mb-2 break-words font-mono text-2xl tracking-tight xl:text-3xl">
              {value === undefined ? "—" : format(value)}
            </div>
            <p className="mb-0 text-xs text-muted-foreground">{note}</p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mb-1 text-lg font-medium">Where your money goes</h2>
            <p className="mb-0 text-xs text-muted-foreground">
              {view === "spending"
                ? "Spending after reimbursements; purchase returns reduce spending."
                : "Income is positive; outflows are negative. Transfers are excluded."}
            </p>
          </div>
          <div className="flex rounded-lg bg-background p-1">
            <Button
              size="sm"
              variant={view === "spending" ? "default" : "ghost"}
              onClick={() => setView("spending")}
            >
              Spending
            </Button>
            <Button
              size="sm"
              variant={view === "cashflow" ? "default" : "ghost"}
              onClick={() => setView("cashflow")}
            >
              Cashflow
            </Button>
          </div>
        </div>
        <div
          className={`${report && !report.rows.length ? "h-40" : "h-72"} min-w-0`}
          aria-label="Spending and cashflow chart"
        >
          {!report ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {loading ? "Loading your report…" : "Refresh to load analytics."}
            </div>
          ) : !report.rows.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Wallet size={28} />
              <p>No transactions in this period.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} stackOffset="sign">
                <CartesianGrid stroke="#2a3730" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip />
                {labels.map(([id, label], i) => (
                  <Bar
                    key={id}
                    name={label}
                    dataKey={id}
                    stackId="total"
                    isAnimationActive={false}
                    fill={colors[i % colors.length]}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 not-empty:mt-5">
          {labels.map(([id, label], i) => (
            <span
              key={id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: colors[i % colors.length] }}
              />
              {label}
            </span>
          ))}
        </div>
      </Card>
      <Card className="overflow-x-auto">
        <h2 className="mb-5 text-lg font-medium">The details</h2>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Category</th>
              <th>Income</th>
              <th>Outflows</th>
              <th>Spending</th>
              <th>
                <span className="sr-only">Transactions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {report?.periods.flatMap((period) => {
              const rows = report.rows.filter((r) => r.period === period);
              return rows.length
                ? rows.map((r) => (
                    <tr key={r.period + r.groupId}>
                      <td>{r.period}</td>
                      <td>{r.label}</td>
                      <td className="font-mono">{format(r.income)}</td>
                      <td className="font-mono">{format(r.outflows)}</td>
                      <td className="font-mono">{format(r.spending)}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${r.label} transactions for ${period}`}
                          onClick={() => drill(period, r.groupId)}
                        >
                          <ArrowRight size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))
                : [
                    <tr key={period}>
                      <td>{period}</td>
                      <td>No activity</td>
                      <td>{format(0)}</td>
                      <td>{format(0)}</td>
                      <td>{format(0)}</td>
                      <td />
                    </tr>,
                  ];
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
