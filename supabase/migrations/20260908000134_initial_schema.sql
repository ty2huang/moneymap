-- drizzle-source: 0000_cuddly_jazinda.sql
CREATE SCHEMA "webapp";
--> statement-breakpoint
CREATE TABLE "webapp"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"bankName" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"archived" boolean NOT NULL,
	CONSTRAINT "accounts_household_id_unique" UNIQUE("householdId","id"),
	CONSTRAINT "accounts_version_check" CHECK ("webapp"."accounts"."version" > 0),
	CONSTRAINT "accounts_type_check" CHECK ("webapp"."accounts"."type" in ('checking', 'savings', 'credit_card', 'cash', 'other'))
);
--> statement-breakpoint
CREATE TABLE "webapp"."allocations" (
	"householdId" uuid NOT NULL,
	"receiptId" uuid NOT NULL,
	"expenseId" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "allocations_receiptId_expenseId_pk" PRIMARY KEY("receiptId","expenseId"),
	CONSTRAINT "allocations_amount_check" CHECK ("webapp"."allocations"."amount" > 0 and "webapp"."allocations"."amount" <= 1000000000000),
	CONSTRAINT "allocations_distinct_check" CHECK ("webapp"."allocations"."receiptId" <> "webapp"."allocations"."expenseId")
);
--> statement-breakpoint
CREATE TABLE "webapp"."audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"action" text NOT NULL,
	"recordId" uuid,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webapp"."categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"parentId" uuid,
	"builtin" boolean NOT NULL,
	"hidden" boolean NOT NULL,
	CONSTRAINT "categories_household_id_unique" UNIQUE("householdId","id"),
	CONSTRAINT "categories_version_check" CHECK ("webapp"."categories"."version" > 0),
	CONSTRAINT "categories_kind_check" CHECK ("webapp"."categories"."kind" in ('income', 'expense')),
	CONSTRAINT "categories_not_own_parent" CHECK ("webapp"."categories"."parentId" is distinct from "webapp"."categories"."id")
);
--> statement-breakpoint
CREATE TABLE "webapp"."grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"clientId" text NOT NULL,
	"permission" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "grants_permission_check" CHECK ("webapp"."grants"."permission" in ('read', 'write'))
);
--> statement-breakpoint
CREATE TABLE "webapp"."households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"wrappedKey" text NOT NULL,
	CONSTRAINT "households_currency_check" CHECK ("webapp"."households"."currency" in ('CAD', 'USD')),
	CONSTRAINT "households_revision_check" CHECK ("webapp"."households"."revision" >= 0),
	CONSTRAINT "households_timezone_check" CHECK ("webapp"."households"."timezone" <> '')
);
--> statement-breakpoint
CREATE TABLE "webapp"."idempotency" (
	"householdId" uuid NOT NULL,
	"key" text NOT NULL,
	"userId" uuid NOT NULL,
	"requestHash" text NOT NULL,
	CONSTRAINT "idempotency_householdId_userId_key_pk" PRIMARY KEY("householdId","userId","key")
);
--> statement-breakpoint
CREATE TABLE "webapp"."invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"hash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "invitations_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "webapp"."members" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"role" text NOT NULL,
	"displayName" text DEFAULT 'Member' NOT NULL,
	CONSTRAINT "members_role_check" CHECK ("webapp"."members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "webapp"."requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"displayName" text DEFAULT 'Member' NOT NULL,
	CONSTRAINT "requests_status_check" CHECK ("webapp"."requests"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "webapp"."tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"permission" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tokens_hash_unique" UNIQUE("hash"),
	CONSTRAINT "tokens_permission_check" CHECK ("webapp"."tokens"."permission" in ('read', 'write'))
);
--> statement-breakpoint
CREATE TABLE "webapp"."transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"date" date NOT NULL,
	"categoryId" uuid NOT NULL,
	"subcategoryId" uuid,
	"accountId" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"reimbursable" bigint NOT NULL,
	"description" text NOT NULL,
	"comments" text NOT NULL,
	"createdBy" uuid NOT NULL,
	"updatedBy" uuid NOT NULL,
	CONSTRAINT "transactions_household_id_unique" UNIQUE("householdId","id"),
	CONSTRAINT "transactions_version_check" CHECK ("webapp"."transactions"."version" > 0),
	CONSTRAINT "transactions_amount_check" CHECK ("webapp"."transactions"."amount" between -1000000000000 and 1000000000000 and "webapp"."transactions"."amount" <> 0),
	CONSTRAINT "transactions_reimbursable_check" CHECK ("webapp"."transactions"."reimbursable" between -1000000000000 and 1000000000000 and abs("webapp"."transactions"."reimbursable") <= abs("webapp"."transactions"."amount") and ("webapp"."transactions"."reimbursable" = 0 or sign("webapp"."transactions"."reimbursable") = sign("webapp"."transactions"."amount")))
);
--> statement-breakpoint
CREATE TABLE "webapp"."transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"householdId" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"date" date NOT NULL,
	"sourceId" uuid NOT NULL,
	"destinationId" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"description" text NOT NULL,
	"comments" text NOT NULL,
	"createdBy" uuid NOT NULL,
	"updatedBy" uuid NOT NULL,
	CONSTRAINT "transfers_version_check" CHECK ("webapp"."transfers"."version" > 0),
	CONSTRAINT "transfers_amount_check" CHECK ("webapp"."transfers"."amount" > 0 and "webapp"."transfers"."amount" <= 1000000000000),
	CONSTRAINT "transfers_distinct_accounts" CHECK ("webapp"."transfers"."sourceId" <> "webapp"."transfers"."destinationId")
);
--> statement-breakpoint
ALTER TABLE "webapp"."accounts" ADD CONSTRAINT "accounts_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."allocations" ADD CONSTRAINT "allocations_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."allocations" ADD CONSTRAINT "allocations_receipt_household_fk" FOREIGN KEY ("householdId","receiptId") REFERENCES "webapp"."transactions"("householdId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."allocations" ADD CONSTRAINT "allocations_expense_household_fk" FOREIGN KEY ("householdId","expenseId") REFERENCES "webapp"."transactions"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."audit" ADD CONSTRAINT "audit_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."categories" ADD CONSTRAINT "categories_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."categories" ADD CONSTRAINT "categories_parent_household_fk" FOREIGN KEY ("householdId","parentId") REFERENCES "webapp"."categories"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."grants" ADD CONSTRAINT "grants_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."idempotency" ADD CONSTRAINT "idempotency_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."invitations" ADD CONSTRAINT "invitations_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."members" ADD CONSTRAINT "members_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."requests" ADD CONSTRAINT "requests_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."tokens" ADD CONSTRAINT "tokens_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transactions" ADD CONSTRAINT "transactions_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transactions" ADD CONSTRAINT "transactions_category_household_fk" FOREIGN KEY ("householdId","categoryId") REFERENCES "webapp"."categories"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transactions" ADD CONSTRAINT "transactions_subcategory_household_fk" FOREIGN KEY ("householdId","subcategoryId") REFERENCES "webapp"."categories"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transactions" ADD CONSTRAINT "transactions_account_household_fk" FOREIGN KEY ("householdId","accountId") REFERENCES "webapp"."accounts"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transfers" ADD CONSTRAINT "transfers_householdId_households_id_fk" FOREIGN KEY ("householdId") REFERENCES "webapp"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transfers" ADD CONSTRAINT "transfers_source_household_fk" FOREIGN KEY ("householdId","sourceId") REFERENCES "webapp"."accounts"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webapp"."transfers" ADD CONSTRAINT "transfers_destination_household_fk" FOREIGN KEY ("householdId","destinationId") REFERENCES "webapp"."accounts"("householdId","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_household_idx" ON "webapp"."accounts" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "allocations_household_idx" ON "webapp"."allocations" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "allocations_expense_idx" ON "webapp"."allocations" USING btree ("expenseId");--> statement-breakpoint
CREATE INDEX "audit_household_at_idx" ON "webapp"."audit" USING btree ("householdId","at");--> statement-breakpoint
CREATE INDEX "categories_household_idx" ON "webapp"."categories" USING btree ("householdId");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_sibling_name_unique" ON "webapp"."categories" USING btree ("householdId",coalesce("parentId", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "grant_identity" ON "webapp"."grants" USING btree ("householdId","userId","clientId");--> statement-breakpoint
CREATE INDEX "grants_user_idx" ON "webapp"."grants" USING btree ("userId","householdId");--> statement-breakpoint
CREATE INDEX "invitations_household_idx" ON "webapp"."invitations" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "members_household_idx" ON "webapp"."members" USING btree ("householdId");--> statement-breakpoint
CREATE UNIQUE INDEX "request_user_household" ON "webapp"."requests" USING btree ("userId","householdId");--> statement-breakpoint
CREATE INDEX "requests_household_idx" ON "webapp"."requests" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "tokens_user_idx" ON "webapp"."tokens" USING btree ("userId","householdId");--> statement-breakpoint
CREATE INDEX "tokens_household_idx" ON "webapp"."tokens" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "transactions_household_idx" ON "webapp"."transactions" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "webapp"."transactions" USING btree ("householdId","categoryId");--> statement-breakpoint
CREATE INDEX "transactions_subcategory_idx" ON "webapp"."transactions" USING btree ("householdId","subcategoryId");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "webapp"."transactions" USING btree ("householdId","accountId");--> statement-breakpoint
CREATE INDEX "transfers_household_idx" ON "webapp"."transfers" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "transfers_source_idx" ON "webapp"."transfers" USING btree ("householdId","sourceId");--> statement-breakpoint
CREATE INDEX "transfers_destination_idx" ON "webapp"."transfers" USING btree ("householdId","destinationId");
