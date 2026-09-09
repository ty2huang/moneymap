"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, Select, ErrorMessage } from "./ui/fields";
import { api } from "@/lib/client";
import type { Snapshot, Transaction, Transfer } from "@/domain/types";
import { decimal, today, money, minor } from "@/domain/money";
import { received, isReceipt } from "@/domain/ledger";
export function TransactionForm({
  snapshot,
  existing,
  duplicate = false,
  receipt = false,
  transfer = false,
  onSaved,
}: {
  snapshot: Snapshot;
  existing?: Transaction | Transfer;
  duplicate?: boolean;
  receipt?: boolean;
  transfer?: boolean;
  onSaved: () => void;
}) {
  const { ledger, household } = snapshot,
    currency = household.currency,
    tx = existing as Transaction | undefined,
    tr = existing as Transfer | undefined;
  const income = ledger.categories.find(
      (c) => !c.parentId && c.kind === "income",
    ),
    refund = ledger.categories.find(
      (c) => c.builtin && c.name === "Refund" && c.kind === "income",
    );
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      date: duplicate || !existing ? today(household.timezone) : existing.date,
      categoryId: receipt
        ? (income?.id ?? "")
        : (tx?.categoryId ??
          ledger.categories.find(
            (c) => !c.parentId && c.kind === "expense" && !c.hidden,
          )?.id ??
          ""),
      subcategoryId: receipt ? (refund?.id ?? "") : (tx?.subcategoryId ?? ""),
      accountId:
        tx?.accountId ?? ledger.accounts.find((a) => !a.archived)?.id ?? "",
      amount: existing ? decimal(existing.amount, currency) : "",
      reimbursable: decimal(tx?.reimbursable ?? 0, currency),
      description: existing?.description ?? "",
      comments: existing?.comments ?? "",
      sourceId:
        tr?.sourceId ?? ledger.accounts.find((a) => !a.archived)?.id ?? "",
      destinationId: tr?.destinationId ?? "",
    },
  });
  const [allocations, setAllocations] = useState<Record<string, string>>(
      Object.fromEntries(
        (duplicate ? [] : (tx?.allocations ?? [])).map((a) => [
          a.expenseId,
          decimal(a.amount, currency),
        ]),
      ),
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const categoryId = watch("categoryId"),
    subcategoryId = watch("subcategoryId"),
    refundMode = !transfer && isReceipt(ledger, { subcategoryId });
  const expenses = ledger.transactions.filter(
    (t) =>
      t.reimbursable > 0 &&
      ledger.categories.find((c) => c.id === t.categoryId)?.kind ===
        "expense" &&
      t.reimbursable -
        received(ledger, t.id, duplicate ? undefined : existing?.id) >
        0,
  );
  async function save(values: {
    date: string;
    categoryId: string;
    subcategoryId: string;
    accountId: string;
    amount: string;
    reimbursable: string;
    description: string;
    comments: string;
    sourceId: string;
    destinationId: string;
  }) {
    setError("");
    setSaving(true);
    try {
      const base =
        existing && !duplicate
          ? { id: existing.id, version: existing.version }
          : {};
      const data = transfer
        ? {
            ...base,
            date: values.date,
            amount: values.amount,
            description: values.description,
            comments: values.comments,
            sourceId: values.sourceId,
            destinationId: values.destinationId,
          }
        : {
            ...base,
            date: values.date,
            categoryId: values.categoryId,
            subcategoryId: values.subcategoryId || null,
            accountId: values.accountId,
            amount: refundMode ? "0" : values.amount,
            reimbursable: refundMode ? "0" : values.reimbursable || "0",
            description: values.description,
            comments: values.comments,
            allocations: refundMode
              ? Object.entries(allocations)
                  .filter(([, v]) => v && Number(v) !== 0)
                  .map(([expenseId, amount]) => ({ expenseId, amount }))
              : [],
          };
      await api("/api/state", {
        type: transfer ? "transfer.save" : "transaction.save",
        data,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const accounts = ledger.accounts.filter(
    (a) =>
      !a.archived ||
      [tx?.accountId, tr?.sourceId, tr?.destinationId].includes(a.id),
  );
  return (
    <form onSubmit={handleSubmit(save)} className="space-y-4">
      {!accounts.length && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
        >
          Add a financial account in Accounts before recording a transaction.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" required {...register("date")} />
        </Field>
        <Field label={transfer ? "From account" : "Financial account"}>
          <Select
            required
            disabled={!accounts.length}
            {...register(transfer ? "sourceId" : "accountId")}
          >
            {!accounts.length && (
              <option value="">No accounts available</option>
            )}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {transfer ? (
        <Field label="To account">
          <Select required {...register("destinationId")}>
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <Select
              {...register("categoryId", {
                onChange: () => setValue("subcategoryId", ""),
              })}
            >
              {ledger.categories
                .filter(
                  (c) => !c.parentId && (!c.hidden || c.id === tx?.categoryId),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Subcategory">
            <Select {...register("subcategoryId")}>
              <option value="">Unspecified</option>
              {ledger.categories
                .filter(
                  (c) =>
                    c.parentId === categoryId &&
                    (!c.hidden || c.id === tx?.subcategoryId),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      )}
      {!refundMode && (
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Amount (${currency})`}>
            <Input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...register("amount")}
            />
          </Field>
          {!transfer && (
            <Field label="Reimbursable amount">
              <Input inputMode="decimal" {...register("reimbursable")} />
            </Field>
          )}
        </div>
      )}
      {refundMode && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">Allocate this repayment</h3>
          <p className="text-xs text-muted-foreground">
            Enter what was received for each expense. The receipt total is
            calculated automatically.
          </p>
          {!expenses.length && (
            <p className="text-sm text-muted-foreground">
              No outstanding reimbursable expenses.
            </p>
          )}
          {expenses.map((t) => (
            <div
              key={t.id}
              className="my-3 grid grid-cols-[1fr_110px] items-center gap-3"
            >
              <label htmlFor={"allocation-" + t.id} className="text-sm">
                {t.description ||
                  ledger.categories.find((c) => c.id === t.categoryId)?.name}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t.date} ·{" "}
                  {money(
                    t.reimbursable -
                      received(
                        ledger,
                        t.id,
                        duplicate ? undefined : existing?.id,
                      ),
                    currency,
                  )}{" "}
                  remaining
                </span>
              </label>
              <Input
                id={"allocation-" + t.id}
                inputMode="decimal"
                placeholder="0.00"
                value={allocations[t.id] ?? ""}
                onChange={(e) =>
                  setAllocations((a) => ({ ...a, [t.id]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      )}
      <Field label="Description">
        <Input
          maxLength={4000}
          placeholder="What was it for?"
          {...register("description")}
        />
      </Field>
      <Field label="Comments">
        <textarea
          className="min-h-20 rounded-lg border border-input bg-background p-3 text-sm text-foreground"
          maxLength={4000}
          placeholder="Anything else worth remembering"
          {...register("comments")}
        />
      </Field>
      <ErrorMessage message={error} />
      <Button
        type="submit"
        className="w-full"
        disabled={saving || accounts.length === 0}
      >
        {saving
          ? "Saving…"
          : existing && !duplicate
            ? "Save changes"
            : refundMode
              ? "Record reimbursement"
              : transfer
                ? "Add transfer"
                : "Add transaction"}
      </Button>
    </form>
  );
}
