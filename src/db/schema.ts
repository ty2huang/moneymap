import {
  pgSchema,
  uuid,
  text,
  date,
  timestamp,
  integer,
  boolean,
  bigint,
  check,
  foreignKey,
  index,
  primaryKey,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const webappSchema = pgSchema("webapp");
export const households = webappSchema.table(
  "households",
  {
    id: uuid().primaryKey(),
    currency: text().$type<"CAD" | "USD">().notNull(),
    timezone: text().notNull(),
    revision: integer().notNull().default(0),
    wrappedKey: text().notNull(),
  },
  (t) => [
    check("households_currency_check", sql`${t.currency} in ('CAD', 'USD')`),
    check("households_revision_check", sql`${t.revision} >= 0`),
    check("households_timezone_check", sql`${t.timezone} <> ''`),
  ],
);
export const members = webappSchema.table(
  "members",
  {
    userId: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    role: text().$type<"owner" | "member">().notNull(),
    displayName: text().notNull().default("Member"),
  },
  (t) => [
    check("members_role_check", sql`${t.role} in ('owner', 'member')`),
    index("members_household_idx").on(t.householdId),
  ],
);
export const invitations = webappSchema.table(
  "invitations",
  {
    id: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    hash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    revoked: boolean().notNull().default(false),
  },
  (t) => [index("invitations_household_idx").on(t.householdId)],
);
export const requests = webappSchema.table(
  "requests",
  {
    id: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid().notNull(),
    status: text().notNull().default("pending"),
    displayName: text().notNull().default("Member"),
  },
  (t) => [
    check(
      "requests_status_check",
      sql`${t.status} in ('pending', 'approved', 'rejected')`,
    ),
    uniqueIndex("request_user_household").on(t.userId, t.householdId),
    index("requests_household_idx").on(t.householdId),
  ],
);
const scoped = () => ({
  id: uuid().primaryKey(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  version: integer().notNull().default(1),
});
export const accounts = webappSchema.table(
  "accounts",
  {
    ...scoped(),
    bankName: text().notNull(),
    name: text().notNull(),
    type: text()
      .$type<"checking" | "savings" | "credit_card" | "cash" | "other">()
      .notNull(),
    archived: boolean().notNull(),
  },
  (t) => [
    unique("accounts_household_id_unique").on(t.householdId, t.id),
    check("accounts_version_check", sql`${t.version} > 0`),
    check(
      "accounts_type_check",
      sql`${t.type} in ('checking', 'savings', 'credit_card', 'cash', 'other')`,
    ),
    index("accounts_household_idx").on(t.householdId),
  ],
);
export const categories = webappSchema.table(
  "categories",
  {
    ...scoped(),
    name: text().notNull(),
    kind: text().$type<"income" | "expense">().notNull(),
    parentId: uuid(),
    builtin: boolean().notNull(),
    hidden: boolean().notNull(),
  },
  (t) => [
    unique("categories_household_id_unique").on(t.householdId, t.id),
    foreignKey({
      name: "categories_parent_household_fk",
      columns: [t.householdId, t.parentId],
      foreignColumns: [t.householdId, t.id],
    }),
    check("categories_version_check", sql`${t.version} > 0`),
    check("categories_kind_check", sql`${t.kind} in ('income', 'expense')`),
    check("categories_not_own_parent", sql`${t.parentId} is distinct from ${t.id}`),
    index("categories_household_idx").on(t.householdId),
    uniqueIndex("categories_sibling_name_unique").on(
      t.householdId,
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
  ],
);
export const transactions = webappSchema.table(
  "transactions",
  {
    ...scoped(),
    date: date({ mode: "string" }).notNull(),
    categoryId: uuid().notNull(),
    subcategoryId: uuid(),
    accountId: uuid().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
    reimbursable: bigint({ mode: "number" }).notNull(),
    description: text().notNull(),
    comments: text().notNull(),
    createdBy: uuid().notNull(),
    updatedBy: uuid().notNull(),
  },
  (t) => [
    unique("transactions_household_id_unique").on(t.householdId, t.id),
    foreignKey({
      name: "transactions_category_household_fk",
      columns: [t.householdId, t.categoryId],
      foreignColumns: [categories.householdId, categories.id],
    }),
    foreignKey({
      name: "transactions_subcategory_household_fk",
      columns: [t.householdId, t.subcategoryId],
      foreignColumns: [categories.householdId, categories.id],
    }),
    foreignKey({
      name: "transactions_account_household_fk",
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
    }),
    check("transactions_version_check", sql`${t.version} > 0`),
    check(
      "transactions_amount_check",
      sql`${t.amount} between -1000000000000 and 1000000000000 and ${t.amount} <> 0`,
    ),
    check(
      "transactions_reimbursable_check",
      sql`${t.reimbursable} between -1000000000000 and 1000000000000 and abs(${t.reimbursable}) <= abs(${t.amount}) and (${t.reimbursable} = 0 or sign(${t.reimbursable}) = sign(${t.amount}))`,
    ),
    index("transactions_household_idx").on(t.householdId),
    index("transactions_category_idx").on(t.householdId, t.categoryId),
    index("transactions_subcategory_idx").on(t.householdId, t.subcategoryId),
    index("transactions_account_idx").on(t.householdId, t.accountId),
  ],
);
export const allocations = webappSchema.table(
  "allocations",
  {
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    receiptId: uuid().notNull(),
    expenseId: uuid().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.receiptId, t.expenseId] }),
    foreignKey({
      name: "allocations_receipt_household_fk",
      columns: [t.householdId, t.receiptId],
      foreignColumns: [transactions.householdId, transactions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "allocations_expense_household_fk",
      columns: [t.householdId, t.expenseId],
      foreignColumns: [transactions.householdId, transactions.id],
    }),
    check(
      "allocations_amount_check",
      sql`${t.amount} > 0 and ${t.amount} <= 1000000000000`,
    ),
    check("allocations_distinct_check", sql`${t.receiptId} <> ${t.expenseId}`),
    index("allocations_household_idx").on(t.householdId),
    index("allocations_expense_idx").on(t.expenseId),
  ],
);
export const transfers = webappSchema.table(
  "transfers",
  {
    ...scoped(),
    date: date({ mode: "string" }).notNull(),
    sourceId: uuid().notNull(),
    destinationId: uuid().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
    description: text().notNull(),
    comments: text().notNull(),
    createdBy: uuid().notNull(),
    updatedBy: uuid().notNull(),
  },
  (t) => [
    foreignKey({
      name: "transfers_source_household_fk",
      columns: [t.householdId, t.sourceId],
      foreignColumns: [accounts.householdId, accounts.id],
    }),
    foreignKey({
      name: "transfers_destination_household_fk",
      columns: [t.householdId, t.destinationId],
      foreignColumns: [accounts.householdId, accounts.id],
    }),
    check("transfers_version_check", sql`${t.version} > 0`),
    check(
      "transfers_amount_check",
      sql`${t.amount} > 0 and ${t.amount} <= 1000000000000`,
    ),
    check("transfers_distinct_accounts", sql`${t.sourceId} <> ${t.destinationId}`),
    index("transfers_household_idx").on(t.householdId),
    index("transfers_source_idx").on(t.householdId, t.sourceId),
    index("transfers_destination_idx").on(t.householdId, t.destinationId),
  ],
);
export const grants = webappSchema.table(
  "grants",
  {
    id: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid().notNull(),
    clientId: text().notNull(),
    permission: text().$type<"read" | "write">().notNull(),
    revoked: boolean().notNull().default(false),
  },
  (t) => [
    uniqueIndex("grant_identity").on(t.householdId, t.userId, t.clientId),
    check("grants_permission_check", sql`${t.permission} in ('read', 'write')`),
    index("grants_user_idx").on(t.userId, t.householdId),
  ],
);
export const tokens = webappSchema.table(
  "tokens",
  {
    id: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid().notNull(),
    name: text().notNull(),
    hash: text().notNull().unique(),
    permission: text().$type<"read" | "write">().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    revoked: boolean().notNull().default(false),
  },
  (t) => [
    check("tokens_permission_check", sql`${t.permission} in ('read', 'write')`),
    index("tokens_user_idx").on(t.userId, t.householdId),
    index("tokens_household_idx").on(t.householdId),
  ],
);
export const idempotency = webappSchema.table(
  "idempotency",
  {
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text().notNull(),
    userId: uuid().notNull(),
    requestHash: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId, t.key] })],
);
export const audit = webappSchema.table(
  "audit",
  {
    id: uuid().primaryKey(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid().notNull(),
    action: text().notNull(),
    recordId: uuid(),
    at: timestamp({ withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("audit_household_at_idx").on(t.householdId, t.at)],
);
