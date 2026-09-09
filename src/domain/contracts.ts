import { z } from "zod";
const id = z.string().uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  );
const amount = z
  .string()
  .max(30)
  .regex(/^-?\d+(\.\d+)?$/);
const text = z.string().max(4000).default("");
const base = {
  id: id.optional(),
  version: z.number().int().positive().optional(),
};
export const accountInput = z
  .object({
    ...base,
    bankName: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    type: z.enum(["checking", "savings", "credit_card", "cash", "other"]),
    archived: z.boolean().default(false),
  })
  .strict();
export const categoryInput = z
  .object({
    ...base,
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["income", "expense"]),
    parentId: id.nullable().default(null),
    hidden: z.boolean().default(false),
  })
  .strict();
export const transactionInput = z
  .object({
    ...base,
    date,
    categoryId: id,
    subcategoryId: id.nullable().default(null),
    accountId: id,
    amount: amount.default("0"),
    reimbursable: amount.default("0"),
    description: text,
    comments: text,
    allocations: z
      .array(z.object({ expenseId: id, amount }).strict())
      .max(200)
      .default([]),
  })
  .strict();
export const transferInput = z
  .object({
    ...base,
    date,
    sourceId: id,
    destinationId: id,
    amount,
    description: text,
    comments: text,
  })
  .strict();
export const removeInput = z
  .object({ id, version: z.number().int().positive() })
  .strict();
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("account.save"), data: accountInput }),
  z.object({ type: z.literal("category.save"), data: categoryInput }),
  z.object({ type: z.literal("transaction.save"), data: transactionInput }),
  z.object({ type: z.literal("transfer.save"), data: transferInput }),
  ...(
    [
      "account.delete",
      "category.delete",
      "transaction.delete",
      "transfer.delete",
    ] as const
  ).map((type) => z.object({ type: z.literal(type), data: removeInput })),
]);
export type Command = z.infer<typeof commandSchema>;
export const reportInput = z
  .object({
    from: date,
    to: date,
    period: z.enum(["month", "year"]).default("month"),
    group: z.enum(["category", "subcategory"]).default("category"),
    accountId: id.optional(),
  })
  .refine((v) => v.from <= v.to, "Start must precede end")
  .refine(
    (v) => Number(v.to.slice(0, 4)) - Number(v.from.slice(0, 4)) <= 20,
    "Select at most 20 years",
  );
export type ReportInput = z.infer<typeof reportInput>;
