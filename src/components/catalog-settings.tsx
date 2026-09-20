"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Plus, Pencil, Trash2, Landmark, LockKeyhole } from "lucide-react";
import type { Snapshot, Account, Category } from "@/domain/types";
import { api } from "@/lib/client";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog } from "./ui/dialog";
import { Confirm } from "./ui/confirm";
import { Field, Select, ErrorMessage } from "./ui/fields";
export function CatalogSettings({
  snapshot,
  kind,
  onChanged,
}: {
  snapshot: Snapshot;
  kind: "account" | "category";
  onChanged: () => void;
}) {
  const [editor, setEditor] = useState<Account | Category | "new" | null>(null),
    [error, setError] = useState("");
  const l = snapshot.ledger;
  async function remove(row: Account | Category) {
    setError("");
    try {
      await api("/api/state", {
        type: kind + ".delete",
        data: { id: row.id, version: row.version },
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const items =
    kind === "account" ? l.accounts : l.categories.filter((c) => !c.parentId);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-semibold">
            {kind === "account" ? "Financial accounts" : "Categories"}
          </h1>
          <p className="mb-0 text-sm text-muted-foreground">
            {kind === "account"
              ? "The accounts your household uses. No bank connections needed."
              : "A shared vocabulary for your spending."}
          </p>
        </div>
        <Button onClick={() => setEditor("new")}>
          <Plus size={16} />
          Add {kind}
        </Button>
      </div>
      <ErrorMessage message={error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Card key={item.id}>
            <div className="mb-4 flex items-center justify-between">
              {kind === "account" ? (
                <Landmark size={22} className="text-primary" />
              ) : (
                <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {"builtin" in item && item.builtin ? "Prebuilt" : "Custom"}
                </span>
              )}
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => setEditor(item)}
                >
                  <Pencil size={15} />
                </Button>
                {(!("builtin" in item) || !item.builtin) && (
                  <Confirm
                    title={`Remove ${item.name}?`}
                    onConfirm={() => void remove(item)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </Confirm>
                )}
              </div>
            </div>
            <h2 className="mb-1 text-lg font-medium">{item.name}</h2>
            {"bankName" in item ? (
              <p className="mb-0 text-sm text-muted-foreground">
                {item.bankName} · {item.type.replace("_", " ")}
                {item.archived ? " · Archived" : ""}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {item.kind}
                  {item.hidden ? " · Hidden from new entries" : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {l.categories
                    .filter((c) => c.parentId === item.id)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center rounded-md border border-border"
                      >
                        <button
                          onClick={() => setEditor(c)}
                          className={`px-2 py-1.5 text-xs ${c.hidden ? "text-muted-foreground line-through" : ""}`}
                        >
                          {c.name}
                        </button>
                        {!c.builtin && (
                          <Confirm
                            title={`Remove ${c.name}?`}
                            onConfirm={() => void remove(c)}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${c.name}`}
                            >
                              <Trash2 size={11} />
                            </Button>
                          </Confirm>
                        )}
                      </div>
                    ))}
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
      {!items.length && (
        <Card className="py-16 text-center text-muted-foreground">
          Add your first account to start recording transactions.
        </Card>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(open) => !open && setEditor(null)}
        title={`${editor === "new" ? "Add" : "Edit"} ${kind}`}
      >
        <CatalogForm
          key={typeof editor === "object" ? editor?.id : "new"}
          kind={kind}
          existing={editor === "new" ? undefined : (editor ?? undefined)}
          snapshot={snapshot}
          onSaved={() => {
            setEditor(null);
            onChanged();
          }}
        />
      </Dialog>
    </div>
  );
}
function CatalogForm({
  kind,
  existing,
  snapshot,
  onSaved,
}: {
  kind: "account" | "category";
  existing?: Account | Category;
  snapshot: Snapshot;
  onSaved: () => void;
}) {
  const a = existing as Account | undefined,
    c = existing as Category | undefined;
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: existing?.name ?? "",
      bankName: a?.bankName ?? "",
      type: a?.type ?? "checking",
      archived: a?.archived ?? false,
      kind: c?.kind ?? "expense",
      parentId: c?.parentId ?? "",
      hidden: c?.hidden ?? false,
    },
  });
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (v) => {
        setSaving(true);
        try {
          const base = existing
            ? { id: existing.id, version: existing.version }
            : {};
          const parent = snapshot.ledger.categories.find(
            (c) => c.id === v.parentId,
          );
          await api("/api/state", {
            type: kind + ".save",
            data:
              kind === "account"
                ? {
                    ...base,
                    name: v.name,
                    bankName: v.bankName,
                    type: v.type,
                    archived: v.archived,
                  }
                : {
                    ...base,
                    name: v.name,
                    kind: parent?.kind ?? v.kind,
                    parentId: v.parentId || null,
                    hidden: v.hidden,
                  },
          });
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSaving(false);
        }
      })}
    >
      <Field label="Name">
        <Input required readOnly={c?.builtin} {...register("name")} />
      </Field>
      {kind === "account" ? (
        <>
          <Field label="Bank name">
            <Input required {...register("bankName")} />
          </Field>
          <Field label="Account type">
            <Select {...register("type")}>
              {["checking", "savings", "credit_card", "cash", "other"].map(
                (type) => (
                  <option key={type} value={type}>
                    {type.replace("_", " ")}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" {...register("archived")} />
            Archive account
          </label>
        </>
      ) : (
        <>
          <Field label="Parent category">
            <Select disabled={!!existing} {...register("parentId")}>
              <option value="">None — top-level category</option>
              {snapshot.ledger.categories
                .filter((c) => !c.parentId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Classification (inherited for subcategories)">
            <Select disabled={!!existing} {...register("kind")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" {...register("hidden")} />
            Hide from new entries
          </label>
          {c?.builtin && (
            <p className="flex gap-2 text-xs text-muted-foreground">
              <LockKeyhole size={14} />
              Prebuilt definitions are fixed. Visibility is a household
              preference.
            </p>
          )}
        </>
      )}
      <ErrorMessage message={error} />
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
