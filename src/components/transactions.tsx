"use client";
import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Plus,
  ArrowLeftRight,
  Download,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Snapshot, Transaction, Transfer } from "@/domain/types";
import { money, decimal, netCost } from "@/domain/money";
import { csv } from "@/domain/analytics";
import { outstanding, received } from "@/domain/ledger";
import { api, download } from "@/lib/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { DatePicker } from "./ui/date-picker";
import { Select, Field, ErrorMessage } from "./ui/fields";
import { Dialog } from "./ui/dialog";
import { Confirm } from "./ui/confirm";
import { TransactionForm } from "./transaction-form";
import type { Drill } from "./dashboard";
export function Transactions({
  snapshot,
  onChanged,
  initialFilters,
}: {
  snapshot: Snapshot;
  onChanged: () => void;
  initialFilters?: Drill;
}) {
  const { ledger: l, household: h } = snapshot;
  const [filters, setFilters] = useState({
    from: initialFilters?.from ?? "",
    to: initialFilters?.to ?? "",
    accountId: initialFilters?.accountId ?? "",
    categoryId: initialFilters?.categoryId ?? "",
    subcategoryId: initialFilters?.subcategoryId ?? "",
    kind: "",
    status: "",
  });
  const [editor, setEditor] = useState<{
      existing?: Transaction | Transfer;
      duplicate?: boolean;
      receipt?: boolean;
      transfer?: boolean;
    } | null>(null),
    [error, setError] = useState("");
  const rows = useMemo(
    () =>
      [
        ...l.transactions.map((t) => ({
          ...t,
          kind: l.categories.find((c) => c.id === t.categoryId)!.kind,
        })),
        ...l.transfers.map((t) => ({ ...t, kind: "transfer" })),
      ]
        .filter(
          (t) =>
            (!filters.from || t.date >= filters.from) &&
            (!filters.to || t.date <= filters.to) &&
            (!filters.kind || t.kind === filters.kind) &&
            (!filters.accountId ||
              ("accountId" in t
                ? t.accountId === filters.accountId
                : t.sourceId === filters.accountId ||
                  t.destinationId === filters.accountId)) &&
            (!filters.categoryId ||
              ("categoryId" in t && t.categoryId === filters.categoryId)) &&
            (!filters.subcategoryId ||
              ("subcategoryId" in t &&
                t.subcategoryId === filters.subcategoryId)) &&
            (!filters.status ||
              ("reimbursable" in t &&
                (filters.status === "outstanding"
                  ? outstanding(l, t) > 0
                  : filters.status === "partial"
                    ? outstanding(l, t) > 0 && received(l, t.id) > 0
                    : t.reimbursable > 0 && outstanding(l, t) === 0))),
        )
        .sort(
          (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
        ),
    [l, filters],
  );
  async function remove(t: (typeof rows)[number]) {
    setError("");
    try {
      await api("/api/state", {
        type: t.kind === "transfer" ? "transfer.delete" : "transaction.delete",
        data: { id: t.id, version: t.version },
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const columns: ColumnDef<(typeof rows)[number]>[] = [
    { header: "Date", accessorKey: "date" },
    {
      header: "Transaction",
      cell: ({ row: { original: t } }) => (
        <div>
          <div className="font-medium">
            {t.description ||
              ("categoryId" in t
                ? l.categories.find((c) => c.id === t.categoryId)?.name
                : "Account transfer")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {"categoryId" in t
              ? [
                  l.categories.find((c) => c.id === t.categoryId)?.name,
                  l.categories.find((c) => c.id === t.subcategoryId)?.name,
                ]
                  .filter(Boolean)
                  .join(" / ")
              : "Transfer · excluded from reports"}
          </div>
        </div>
      ),
    },
    {
      header: "Account",
      cell: ({ row: { original: t } }) =>
        "accountId" in t
          ? l.accounts.find((a) => a.id === t.accountId)?.name
          : `${l.accounts.find((a) => a.id === t.sourceId)?.name} → ${l.accounts.find((a) => a.id === t.destinationId)?.name}`,
    },
    {
      header: "Amount",
      cell: ({ row: { original: t } }) => (
        <span
          className={`font-mono ${t.kind === "income" ? "text-primary" : ""}`}
        >
          {money(t.amount, h.currency)}
        </span>
      ),
    },
    {
      header: "Net cost",
      cell: ({ row: { original: t } }) =>
        "reimbursable" in t
          ? money(
              netCost(t.amount, t.reimbursable, t.kind as "income" | "expense"),
              h.currency,
            )
          : "—",
    },
    {
      header: "Reimbursement",
      cell: ({ row: { original: t } }) =>
        "reimbursable" in t && t.reimbursable > 0 ? (
          <span className="text-xs text-muted-foreground">
            {outstanding(l, t)
              ? `${money(outstanding(l, t), h.currency)} outstanding`
              : "Paid"}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row: { original: t } }) => (
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit transaction"
            onClick={() =>
              setEditor({ existing: t, transfer: t.kind === "transfer" })
            }
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Duplicate transaction"
            onClick={() =>
              setEditor({
                existing: t,
                duplicate: true,
                transfer: t.kind === "transfer",
              })
            }
          >
            <Copy size={14} />
          </Button>
          <Confirm
            title="Delete this transaction?"
            onConfirm={() => void remove(t)}
          >
            <Button variant="ghost" size="icon" aria-label="Delete transaction">
              <Trash2 size={14} />
            </Button>
          </Confirm>
        </div>
      ),
    },
  ];
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });
  const update = (field: string, value: string) => {
    setFilters((f) => ({
      ...f,
      [field]: value,
      ...(field === "categoryId" ? { subcategoryId: "" } : {}),
    }));
    table.setPageIndex(0);
  };
  function exportRows() {
    download(
      "moneymap-transactions.csv",
      csv([
        ["Date", "Kind", "Description", "Amount", "Reimbursable", "Comments"],
        ...rows.map((t) => [
          t.date,
          t.kind,
          t.description,
          decimal(t.amount, h.currency),
          "reimbursable" in t ? decimal(t.reimbursable, h.currency) : "0",
          t.comments,
        ]),
      ]),
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-2 text-3xl font-semibold">Transactions</h1>
          <p className="mb-0 text-sm text-muted-foreground">
            Everyday spending, all in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setEditor({ receipt: true })}
          >
            Record reimbursement
          </Button>
          <Button
            variant="outline"
            onClick={() => setEditor({ transfer: true })}
          >
            <ArrowLeftRight size={15} />
            Transfer
          </Button>
          <Button onClick={() => setEditor({})}>
            <Plus size={16} />
            Add transaction
          </Button>
        </div>
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DatePicker
            label="From"
            placeholder="Start date"
            value={filters.from}
            max={filters.to || undefined}
            clearable
            onChange={(value) => update("from", value)}
          />
          <DatePicker
            label="To"
            placeholder="End date"
            value={filters.to}
            min={filters.from || undefined}
            clearable
            onChange={(value) => update("to", value)}
          />
          <Field label="Account">
            <Select
              value={filters.accountId}
              onChange={(e) => update("accountId", e.target.value)}
            >
              <option value="">All accounts</option>
              {l.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              value={filters.categoryId}
              onChange={(e) => update("categoryId", e.target.value)}
            >
              <option value="">All categories</option>
              {l.categories
                .filter((c) => !c.parentId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Subcategory">
            <Select
              value={filters.subcategoryId}
              onChange={(e) => update("subcategoryId", e.target.value)}
            >
              <option value="">All subcategories</option>
              {l.categories
                .filter(
                  (c) =>
                    c.parentId &&
                    (!filters.categoryId || c.parentId === filters.categoryId),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Kind">
            <Select
              value={filters.kind}
              onChange={(e) => update("kind", e.target.value)}
            >
              <option value="">All transactions</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
              <option value="transfer">Transfers</option>
            </Select>
          </Field>
          <Field label="Reimbursements">
            <Select
              value={filters.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="outstanding">Outstanding</option>
              <option value="partial">Partially paid</option>
              <option value="paid">Paid</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="outline" onClick={exportRows}>
              <Download size={15} />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>
      <ErrorMessage message={error} />
      <Card className="overflow-x-auto p-2">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((header) => (
                  <th key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="p-12 text-center text-muted-foreground">
            No transactions here yet. Add one to start your money map.
          </div>
        )}
        <div className="flex items-center justify-between p-4 text-xs text-muted-foreground">
          <span>
            {rows.length} records · Page{" "}
            {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => !open && setEditor(null)}
        title={
          editor?.duplicate
            ? "Duplicate transaction"
            : editor?.existing
              ? "Edit transaction"
              : editor?.receipt
                ? "Record reimbursement"
                : editor?.transfer
                  ? "Move between accounts"
                  : "Add transaction"
        }
      >
        {editor && (
          <TransactionForm
            key={JSON.stringify(editor)}
            snapshot={snapshot}
            {...editor}
            onSaved={() => {
              setEditor(null);
              onChanged();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
