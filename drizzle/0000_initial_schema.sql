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
	"revision" integer DEFAULT 0 NOT NULL,
	"wrappedKey" text NOT NULL,
	CONSTRAINT "households_currency_check" CHECK ("webapp"."households"."currency" in ('CAD', 'USD')),
	CONSTRAINT "households_revision_check" CHECK ("webapp"."households"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webapp"."http_oauth_leases" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lease_id" uuid NOT NULL,
	"household_id" uuid,
	"expires_at" timestamp with time zone NOT NULL
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
--> statement-breakpoint

-- Application policies, financial constraints, and Supabase integrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moneymap_app') THEN
    CREATE ROLE moneymap_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA webapp FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA webapp FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA webapp TO moneymap_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA webapp TO moneymap_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA webapp
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO moneymap_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION webapp.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION webapp.current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT nullif(current_setting('app.household_id', true), '')::uuid
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION webapp.current_user_id() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION webapp.current_household_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION webapp.current_user_id() TO moneymap_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION webapp.current_household_id() TO moneymap_app;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'members', 'invitations', 'requests', 'accounts',
    'categories', 'transactions', 'allocations', 'transfers', 'grants',
    'tokens', 'idempotency', 'audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE webapp.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE webapp.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_context ON webapp.%I FOR ALL TO moneymap_app '
      'USING ("householdId" = (SELECT webapp.current_household_id())) '
      'WITH CHECK ("householdId" = (SELECT webapp.current_household_id()))',
      table_name
    );
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE webapp.households ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE webapp.households FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_context ON webapp.households
  FOR ALL TO moneymap_app
  USING (id = (SELECT webapp.current_household_id()))
  WITH CHECK (id = (SELECT webapp.current_household_id()));
--> statement-breakpoint
CREATE POLICY own_membership_lookup ON webapp.members
  FOR SELECT TO moneymap_app
  USING ("userId" = (SELECT webapp.current_user_id()));
--> statement-breakpoint
CREATE POLICY own_request_lookup ON webapp.requests
  FOR SELECT TO moneymap_app
  USING ("userId" = (SELECT webapp.current_user_id()));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION webapp.request_join(
  invitation_hash text,
  requested_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := webapp.current_user_id();
  invitation webapp.invitations%ROWTYPE;
  request_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Missing application user context'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM webapp.members WHERE "userId" = actor_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO invitation
  FROM webapp.invitations
  WHERE hash = invitation_hash
    AND NOT revoked
    AND "expiresAt" > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO webapp.requests (
    id, "householdId", "userId", status, "displayName"
  )
  VALUES (
    gen_random_uuid(),
    invitation."householdId",
    actor_id,
    'pending',
    left(requested_display_name, 120)
  )
  ON CONFLICT ("userId", "householdId") DO UPDATE
    SET status = 'pending', "displayName" = EXCLUDED."displayName"
  RETURNING id INTO request_id;
  RETURN request_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION webapp.request_join(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION webapp.request_join(text, text) TO moneymap_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION webapp.resolve_token(token_hash text)
RETURNS TABLE(id uuid, user_id uuid, household_id uuid, permission text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t."userId", t."householdId", t.permission
  FROM webapp.tokens AS t
  JOIN webapp.members AS m
    ON m."userId" = t."userId" AND m."householdId" = t."householdId"
  WHERE t.hash = token_hash AND NOT t.revoked AND t."expiresAt" > now()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION webapp.resolve_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION webapp.resolve_token(text) TO moneymap_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION webapp.guard_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  parent webapp.categories%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.builtin AND EXISTS (
      SELECT 1 FROM webapp.households WHERE id = OLD."householdId"
    ) THEN
      RAISE EXCEPTION 'Prebuilt categories cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.builtin AND
     (NEW.name, NEW.kind, NEW."parentId", NEW.builtin, NEW."householdId")
       IS DISTINCT FROM
     (OLD.name, OLD.kind, OLD."parentId", OLD.builtin, OLD."householdId") THEN
    RAISE EXCEPTION 'Prebuilt category definitions are immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW."parentId" IS NOT NULL THEN
    SELECT * INTO parent
    FROM webapp.categories
    WHERE id = NEW."parentId" AND "householdId" = NEW."householdId";
    IF NOT FOUND OR parent."parentId" IS NOT NULL OR parent.kind <> NEW.kind THEN
      RAISE EXCEPTION 'Category parent must be a top-level category of the same kind' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER guard_category
BEFORE INSERT OR UPDATE OR DELETE ON webapp.categories
FOR EACH ROW EXECUTE FUNCTION webapp.guard_category();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION webapp.assert_financial_integrity(transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item webapp.transactions%ROWTYPE;
  allocation_count integer;
  allocation_total bigint;
  receipt boolean;
BEGIN
  SELECT * INTO item FROM webapp.transactions WHERE id = transaction_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM webapp.categories c
    WHERE c.id = item."categoryId" AND c."householdId" = item."householdId"
      AND c."parentId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Transaction category must be top-level' USING ERRCODE = '23514';
  END IF;
  IF item."subcategoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM webapp.categories child
    JOIN webapp.categories parent
      ON parent.id = child."parentId" AND parent."householdId" = child."householdId"
    WHERE child.id = item."subcategoryId"
      AND child."householdId" = item."householdId"
      AND parent.id = item."categoryId" AND parent.kind = child.kind
  ) THEN
    RAISE EXCEPTION 'Transaction subcategory does not match its category' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM webapp.categories c
    WHERE c.id = item."subcategoryId" AND c."householdId" = item."householdId"
      AND c.builtin AND c.name = 'Refund' AND c.kind = 'income'
  ) INTO receipt;
  SELECT count(*)::integer, coalesce(sum(amount), 0)::bigint
    INTO allocation_count, allocation_total
  FROM webapp.allocations WHERE "receiptId" = item.id;

  IF receipt THEN
    IF item.reimbursable <> 0 OR allocation_count = 0 OR item.amount <> allocation_total THEN
      RAISE EXCEPTION 'Refund receipt must exactly equal its allocations' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM webapp.allocations a
      JOIN webapp.transactions expense
        ON expense.id = a."expenseId" AND expense."householdId" = a."householdId"
      JOIN webapp.categories category
        ON category.id = expense."categoryId" AND category."householdId" = expense."householdId"
      WHERE a."receiptId" = item.id
        AND (category.kind <> 'expense' OR expense.date > item.date)
    ) THEN
      RAISE EXCEPTION 'Refund allocation must target an earlier expense' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM webapp.allocations a
      JOIN webapp.transactions expense
        ON expense.id = a."expenseId" AND expense."householdId" = a."householdId"
      GROUP BY expense.id, expense.reimbursable
      HAVING sum(a.amount) > expense.reimbursable
    ) THEN
      RAISE EXCEPTION 'Refund allocation exceeds reimbursable amount' USING ERRCODE = '23514';
    END IF;
  ELSIF allocation_count <> 0 THEN
    RAISE EXCEPTION 'Only refund receipts may have allocations' USING ERRCODE = '23514';
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION webapp.check_financial_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  affected_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'allocations' THEN
    IF TG_OP <> 'DELETE' THEN PERFORM webapp.assert_financial_integrity(NEW."receiptId"); END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM webapp.assert_financial_integrity(OLD."receiptId"); END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN PERFORM webapp.assert_financial_integrity(NEW.id); END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM webapp.assert_financial_integrity(OLD.id); END IF;
    FOR affected_id IN
      SELECT DISTINCT "receiptId" FROM webapp.allocations
      WHERE "expenseId" = coalesce(NEW.id, OLD.id)
    LOOP
      PERFORM webapp.assert_financial_integrity(affected_id);
    END LOOP;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER check_transactions_integrity
AFTER INSERT OR UPDATE OR DELETE ON webapp.transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION webapp.check_financial_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER check_allocations_integrity
AFTER INSERT OR UPDATE OR DELETE ON webapp.allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION webapp.check_financial_integrity();
--> statement-breakpoint

CREATE TABLE webapp.oauth_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  audience text NOT NULL CHECK (
    audience ~ '^https?://[^/?#@[:space:]]+$'
  )
);

REVOKE ALL ON TABLE webapp.oauth_configuration FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT SELECT ON TABLE webapp.oauth_configuration TO supabase_auth_admin;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION webapp.oauth_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims jsonb := event->'claims';
  audience text;
BEGIN
  IF claims ? 'client_id' THEN
    SELECT configuration.audience
    INTO audience
    FROM webapp.oauth_configuration AS configuration
    WHERE configuration.singleton;

    IF audience IS NULL THEN
      RAISE EXCEPTION 'The OAuth audience is not configured.';
    END IF;

    claims := jsonb_set(claims, '{aud}', to_jsonb(audience));
  END IF;

  RETURN jsonb_build_object('claims', claims);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION webapp.oauth_token_hook(jsonb) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA webapp TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION webapp.oauth_token_hook(jsonb) TO supabase_auth_admin;
  END IF;
END
$$;
--> statement-breakpoint

-- Supabase-only Realtime objects are installed when its managed schemas exist.
DO $outer$
DECLARE
  table_name text;
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION webapp.can_receive_realtime(requested_topic text)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
      SELECT requested_topic = 'user:' || (SELECT auth.uid())::text
        OR (
          requested_topic LIKE 'household:%'
          AND EXISTS (
            SELECT 1 FROM webapp.members
            WHERE "userId" = (SELECT auth.uid())
              AND 'household:' || "householdId"::text = requested_topic
          )
        )
    $function$
  $sql$;
  REVOKE ALL ON FUNCTION webapp.can_receive_realtime(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION webapp.can_receive_realtime(text) TO authenticated;

  EXECUTE 'DROP POLICY IF EXISTS moneymap_receive_changes ON realtime.messages';
  EXECUTE $sql$
    CREATE POLICY moneymap_receive_changes ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      extension = 'broadcast'
      AND (SELECT webapp.can_receive_realtime((SELECT realtime.topic())))
    )
  $sql$;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION webapp.broadcast_invalidation()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
      row_data jsonb := coalesce(to_jsonb(NEW), to_jsonb(OLD));
      household_id text := coalesce(row_data->>'householdId', row_data->>'id');
      user_id text := row_data->>'userId';
    BEGIN
      IF household_id IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'household:' || household_id, true);
      END IF;
      IF user_id IS NOT NULL AND TG_TABLE_NAME IN ('members', 'requests') THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'user:' || user_id, true);
      END IF;
      RETURN NULL;
    END
    $function$
  $sql$;
  REVOKE ALL ON FUNCTION webapp.broadcast_invalidation() FROM PUBLIC;

  FOREACH table_name IN ARRAY ARRAY[
    'households', 'members', 'invitations', 'requests', 'accounts',
    'categories', 'transactions', 'allocations', 'transfers', 'grants', 'tokens'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER broadcast_invalidation AFTER INSERT OR UPDATE OR DELETE ON webapp.%I '
      'FOR EACH ROW EXECUTE FUNCTION webapp.broadcast_invalidation()',
      table_name
    );
  END LOOP;
END
$outer$;

--> statement-breakpoint

-- Atomic HTTPS persistence under the restricted application role.
ALTER TABLE webapp.http_oauth_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE webapp.http_oauth_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY own_lease ON webapp.http_oauth_leases FOR ALL TO moneymap_app
  USING (user_id = webapp.current_user_id())
  WITH CHECK (user_id = webapp.current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON webapp.http_oauth_leases TO moneymap_app;

CREATE FUNCTION webapp.http_assert(condition boolean, message text, code text DEFAULT 'INVALID')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING MESSAGE = message, DETAIL = code, ERRCODE = 'P0001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION webapp.http_assert(boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webapp.http_assert(boolean, text, text) TO moneymap_app;

CREATE FUNCTION webapp.http_authorize(actor uuid, client_id text, token_hash text, writable boolean)
RETURNS webapp.households LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  member webapp.members%ROWTYPE;
  household webapp.households%ROWTYPE;
  token record;
BEGIN
  SELECT * INTO member FROM webapp.members WHERE "userId" = actor;
  PERFORM webapp.http_assert(FOUND, 'Create or join a household first.', 'NO_HOUSEHOLD');
  PERFORM set_config('app.household_id', member."householdId"::text, true);
  SELECT * INTO household FROM webapp.households WHERE id = member."householdId" FOR UPDATE;
  PERFORM webapp.http_assert(FOUND, 'Household not found.', 'FORBIDDEN');
  PERFORM webapp.http_assert(EXISTS(
    SELECT 1 FROM webapp.members WHERE "userId" = actor AND "householdId" = household.id
  ), 'Membership has changed.', 'FORBIDDEN');
  IF token_hash IS NOT NULL THEN
    SELECT * INTO token FROM webapp.resolve_token(token_hash);
    PERFORM webapp.http_assert(FOUND AND token.user_id = actor AND token.household_id = household.id
      AND (NOT writable OR token.permission = 'write'), 'Token access is expired, revoked, or read-only.', 'FORBIDDEN');
  END IF;
  IF client_id IS NOT NULL THEN
    PERFORM webapp.http_assert(EXISTS(
      SELECT 1 FROM webapp.grants g WHERE g."userId" = actor AND g."householdId" = household.id
        AND g."clientId" = client_id AND NOT g.revoked AND (NOT writable OR g.permission = 'write')
    ), 'Connection permission denied.', 'FORBIDDEN');
  END IF;
  RETURN household;
END;
$$;
REVOKE ALL ON FUNCTION webapp.http_authorize(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webapp.http_authorize(uuid, text, text, boolean) TO moneymap_app;

CREATE FUNCTION webapp.http_ledger(h uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'accounts', (SELECT coalesce(jsonb_agg(to_jsonb(a) - 'householdId' ORDER BY a.id), '[]'::jsonb) FROM webapp.accounts a WHERE a."householdId" = h),
    'categories', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'householdId' ORDER BY c.id), '[]'::jsonb) FROM webapp.categories c WHERE c."householdId" = h),
    'transactions', (SELECT coalesce(jsonb_agg((to_jsonb(t) - 'householdId') || jsonb_build_object(
      'allocations', (SELECT coalesce(jsonb_agg(jsonb_build_object('expenseId', a."expenseId", 'amount', a.amount) ORDER BY a."expenseId"), '[]'::jsonb)
        FROM webapp.allocations a WHERE a."householdId" = h AND a."receiptId" = t.id)
    ) ORDER BY t.id), '[]'::jsonb) FROM webapp.transactions t WHERE t."householdId" = h),
    'transfers', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'householdId' ORDER BY t.id), '[]'::jsonb) FROM webapp.transfers t WHERE t."householdId" = h)
  );
$$;
REVOKE ALL ON FUNCTION webapp.http_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webapp.http_ledger(uuid) TO moneymap_app;

CREATE FUNCTION webapp.http_persist(h uuid, ledger jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  item jsonb;
  allocation jsonb;
BEGIN
  PERFORM webapp.http_assert(jsonb_typeof(ledger->'accounts') = 'array'
    AND jsonb_typeof(ledger->'categories') = 'array'
    AND jsonb_typeof(ledger->'transactions') = 'array'
    AND jsonb_typeof(ledger->'transfers') = 'array', 'Invalid ledger.');
  DELETE FROM webapp.allocations WHERE "householdId" = h;
  DELETE FROM webapp.transactions WHERE "householdId" = h AND id NOT IN
    (SELECT (x->>'id')::uuid FROM jsonb_array_elements(ledger->'transactions') x);
  DELETE FROM webapp.transfers WHERE "householdId" = h AND id NOT IN
    (SELECT (x->>'id')::uuid FROM jsonb_array_elements(ledger->'transfers') x);
  DELETE FROM webapp.categories WHERE "householdId" = h AND id NOT IN
    (SELECT (x->>'id')::uuid FROM jsonb_array_elements(ledger->'categories') x);
  DELETE FROM webapp.accounts WHERE "householdId" = h AND id NOT IN
    (SELECT (x->>'id')::uuid FROM jsonb_array_elements(ledger->'accounts') x);
  FOR item IN SELECT value FROM jsonb_array_elements(ledger->'accounts') LOOP
    INSERT INTO webapp.accounts SELECT * FROM jsonb_populate_record(NULL::webapp.accounts, item || jsonb_build_object('householdId', h))
    ON CONFLICT (id) DO UPDATE SET "bankName" = EXCLUDED."bankName", name = EXCLUDED.name,
      type = EXCLUDED.type, archived = EXCLUDED.archived, version = EXCLUDED.version
      WHERE accounts.version <> EXCLUDED.version;
  END LOOP;
  -- Parents precede children, even if the application snapshot was sorted by UUID.
  FOR item IN SELECT value FROM jsonb_array_elements(ledger->'categories') ORDER BY value->>'parentId' NULLS FIRST LOOP
    INSERT INTO webapp.categories SELECT * FROM jsonb_populate_record(NULL::webapp.categories, item || jsonb_build_object('householdId', h))
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind,
      "parentId" = EXCLUDED."parentId", builtin = EXCLUDED.builtin,
      hidden = EXCLUDED.hidden, version = EXCLUDED.version WHERE categories.version <> EXCLUDED.version;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(ledger->'transactions') LOOP
    INSERT INTO webapp.transactions SELECT * FROM jsonb_populate_record(NULL::webapp.transactions, item || jsonb_build_object('householdId', h))
    ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, "categoryId" = EXCLUDED."categoryId",
      "subcategoryId" = EXCLUDED."subcategoryId", "accountId" = EXCLUDED."accountId",
      amount = EXCLUDED.amount, reimbursable = EXCLUDED.reimbursable,
      description = EXCLUDED.description, comments = EXCLUDED.comments,
      "updatedBy" = EXCLUDED."updatedBy", version = EXCLUDED.version WHERE transactions.version <> EXCLUDED.version;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(ledger->'transfers') LOOP
    INSERT INTO webapp.transfers SELECT * FROM jsonb_populate_record(NULL::webapp.transfers, item || jsonb_build_object('householdId', h))
    ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, "sourceId" = EXCLUDED."sourceId",
      "destinationId" = EXCLUDED."destinationId", amount = EXCLUDED.amount,
      description = EXCLUDED.description, comments = EXCLUDED.comments,
      "updatedBy" = EXCLUDED."updatedBy", version = EXCLUDED.version WHERE transfers.version <> EXCLUDED.version;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(ledger->'transactions') LOOP
    PERFORM webapp.http_assert(jsonb_typeof(item->'allocations') = 'array', 'Invalid receipt allocations.');
    FOR allocation IN SELECT value FROM jsonb_array_elements(item->'allocations') LOOP
      INSERT INTO webapp.allocations ("householdId", "receiptId", "expenseId", amount)
      VALUES (h, (item->>'id')::uuid, (allocation->>'expenseId')::uuid, (allocation->>'amount')::bigint);
    END LOOP;
  END LOOP;
  -- Deferred receipt checks must run before returning to the API caller role.
  SET CONSTRAINTS ALL IMMEDIATE;
END;
$$;
REVOKE ALL ON FUNCTION webapp.http_persist(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webapp.http_persist(uuid, jsonb) TO moneymap_app;

-- Check another user's lease without broadening application table permissions.
CREATE FUNCTION webapp.http_oauth_busy(actor uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM webapp.http_oauth_leases WHERE user_id = actor AND expires_at > clock_timestamp());
$$;
REVOKE ALL ON FUNCTION webapp.http_oauth_busy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webapp.http_oauth_busy(uuid) TO moneymap_app;

CREATE FUNCTION public.moneymap(operation text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  -- PostgREST verifies the server credential before entering this RPC.
  claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  actor uuid;
  client_id text := nullif(payload->>'actor_client_id', '');
  token_hash text := nullif(payload->>'token_hash', '');
  token record;
  member webapp.members%ROWTYPE;
  household webapp.households%ROWTYPE;
  entry webapp.idempotency%ROWTYPE;
  request webapp.requests%ROWTYPE;
  target webapp.members%ROWTYPE;
  lease webapp.http_oauth_leases%ROWTYPE;
  id uuid;
  h uuid;
  action text;
  result jsonb;
  writable boolean;
  revoked_client text;
BEGIN
  PERFORM webapp.http_assert(claims->>'role' = 'service_role', 'Use server database credentials.', 'FORBIDDEN');
  PERFORM webapp.http_assert(current_user = 'moneymap_app', 'Invalid database API role.', 'FORBIDDEN');
  IF token_hash IS NOT NULL THEN
    SELECT * INTO token FROM webapp.resolve_token(token_hash);
    PERFORM webapp.http_assert(FOUND, 'Token is expired or revoked.', 'UNAUTHORIZED');
    actor := token.user_id;
    client_id := NULL;
  ELSE
    -- The Next.js backend passes its verified user; only service_role can call.
    actor := nullif(payload->>'user_id', '')::uuid;
  END IF;
  PERFORM webapp.http_assert(actor IS NOT NULL, 'Sign in to continue.', 'UNAUTHORIZED');
  PERFORM set_config('app.user_id', actor::text, true);
  PERFORM set_config('app.household_id', '', true);
  IF operation = 'resolve_token' THEN
    PERFORM webapp.http_assert(token_hash IS NOT NULL, 'A personal token is required.', 'UNAUTHORIZED');
    RETURN to_jsonb(token);
  END IF;
  IF operation NOT IN ('snapshot', 'save_ledger') THEN
    PERFORM webapp.http_assert(client_id IS NULL AND token_hash IS NULL,
      'Use MoneyMap to manage household access.', 'FORBIDDEN');
  END IF;
  SELECT * INTO member FROM webapp.members WHERE "userId" = actor;
  IF operation = 'session' THEN
    RETURN jsonb_build_object('userId', actor, 'member', CASE WHEN member."userId" IS NULL THEN NULL ELSE to_jsonb(member) END,
      'requests', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM webapp.requests r WHERE r."userId" = actor));
  END IF;
  IF operation = 'oauth_renew' THEN
    PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(actor::text));
    UPDATE webapp.http_oauth_leases SET expires_at = clock_timestamp() + interval '2 minutes'
    WHERE user_id = actor AND lease_id = (payload->>'lease_id')::uuid AND expires_at > clock_timestamp();
    PERFORM webapp.http_assert(FOUND, 'Authorization has expired. Please try again.', 'FORBIDDEN');
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF operation = 'oauth_end' THEN
    PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(actor::text));
    DELETE FROM webapp.http_oauth_leases WHERE user_id = actor AND lease_id = (payload->>'lease_id')::uuid;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF operation = 'oauth_begin' THEN
    IF member."userId" IS NOT NULL THEN
      household := webapp.http_authorize(actor, NULL, NULL, false);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(actor::text));
    PERFORM webapp.http_assert(NOT webapp.http_oauth_busy(actor), 'Another authorization is in progress. Please try again.', 'OAUTH_BUSY');
    id := gen_random_uuid();
    INSERT INTO webapp.http_oauth_leases (user_id, lease_id, household_id, expires_at)
    VALUES (actor, id, member."householdId", clock_timestamp() + interval '2 minutes')
    ON CONFLICT (user_id) DO UPDATE SET lease_id = EXCLUDED.lease_id, household_id = EXCLUDED.household_id, expires_at = EXCLUDED.expires_at;
    PERFORM set_config('app.household_id', coalesce(member."householdId"::text, ''), true);
    RETURN jsonb_build_object('leaseId', id, 'householdId', member."householdId",
      'activeClientIds', (SELECT coalesce(jsonb_agg(g."clientId"), '[]'::jsonb) FROM webapp.grants g
        WHERE g."userId" = actor AND g."householdId" = member."householdId" AND NOT g.revoked));
  END IF;
  IF operation IN ('create_household', 'join') THEN
    PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(actor::text));
    SELECT * INTO member FROM webapp.members WHERE "userId" = actor;
    PERFORM webapp.http_assert(NOT webapp.http_oauth_busy(actor), 'Authorization is in progress. Please try again.', 'OAUTH_BUSY');
    PERFORM webapp.http_assert(member."userId" IS NULL, 'You already belong to a household.');
    IF operation = 'join' THEN
      id := webapp.request_join(payload->>'invitation_hash', left(coalesce(payload->>'display_name', 'Member'), 120));
      PERFORM webapp.http_assert(id IS NOT NULL, 'Invitation is invalid or expired.');
      RETURN jsonb_build_object('id', id);
    END IF;
    id := (payload->>'id')::uuid;
    PERFORM set_config('app.household_id', id::text, true);
    PERFORM webapp.http_assert(webapp.current_household_id() = id, 'Household context could not be set.');
    INSERT INTO webapp.households (id, currency, "wrappedKey") VALUES (id, payload->>'currency', payload->>'wrapped_key');
    INSERT INTO webapp.members ("userId", "householdId", role, "displayName") VALUES (actor, id, 'owner', left(coalesce(payload->>'display_name', 'Member'), 120));
    PERFORM webapp.http_persist(id, jsonb_build_object('accounts', '[]'::jsonb, 'categories', payload->'categories', 'transactions', '[]'::jsonb, 'transfers', '[]'::jsonb));
    RETURN jsonb_build_object('id', id);
  END IF;
  writable := operation IN ('save_ledger', 'household_action', 'connection_action', 'oauth_grant') OR coalesce((payload->>'write')::boolean, false);
  household := webapp.http_authorize(actor, client_id, token_hash, writable);
  PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(actor::text));
  h := household.id;
  SELECT * INTO member FROM webapp.members WHERE "userId" = actor AND "householdId" = h;
  IF operation IN ('snapshot', 'save_ledger') AND nullif(payload->>'idempotency_key', '') IS NOT NULL THEN
    PERFORM webapp.http_assert(length(payload->>'idempotency_key') <= 128, 'Idempotency key too long.');
    SELECT * INTO entry FROM webapp.idempotency WHERE "householdId" = h AND "userId" = actor AND key = payload->>'idempotency_key';
    IF FOUND THEN
      PERFORM webapp.http_assert(entry."requestHash" = payload->>'request_hash', 'Idempotency key was used for a different request.', 'CONFLICT');
      RETURN jsonb_build_object('revision', household.revision, 'replayed', true);
    END IF;
  END IF;
  IF operation = 'snapshot' THEN
    RETURN jsonb_build_object('household', to_jsonb(household), 'member', to_jsonb(member), 'ledger', webapp.http_ledger(h));
  END IF;
  IF operation = 'save_ledger' THEN
    PERFORM webapp.http_assert(h = (payload->>'household_id')::uuid, 'Membership has changed.', 'FORBIDDEN');
    PERFORM webapp.http_assert(household.revision = (payload->>'expected_revision')::integer, 'The household changed.', 'REVISION_CONFLICT');
    PERFORM webapp.http_assert(payload->>'action' IN ('account.save', 'account.delete', 'category.save', 'category.delete', 'transaction.save', 'transaction.delete', 'transfer.save', 'transfer.delete'), 'Invalid ledger action.');
    PERFORM webapp.http_persist(h, payload->'ledger');
    UPDATE webapp.households SET revision = revision + 1 WHERE households.id = h;
    INSERT INTO webapp.audit (id, "householdId", "userId", action, "recordId", at)
    VALUES (gen_random_uuid(), h, actor, payload->>'action', (payload->>'record_id')::uuid, now());
    IF nullif(payload->>'idempotency_key', '') IS NOT NULL THEN
      INSERT INTO webapp.idempotency ("householdId", "userId", key, "requestHash") VALUES (h, actor, payload->>'idempotency_key', payload->>'request_hash');
    END IF;
    RETURN jsonb_build_object('revision', household.revision + 1, 'replayed', false);
  END IF;
  IF operation = 'household' THEN
    RETURN jsonb_build_object('household', to_jsonb(household) - 'wrappedKey', 'member', to_jsonb(member),
      'members', (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM webapp.members m WHERE m."householdId" = h),
      'requests', CASE WHEN member.role = 'owner' THEN (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM webapp.requests r WHERE r."householdId" = h) ELSE '[]'::jsonb END,
      'invitations', CASE WHEN member.role = 'owner' THEN (SELECT coalesce(jsonb_agg(to_jsonb(i) - 'hash'), '[]'::jsonb) FROM webapp.invitations i WHERE i."householdId" = h) ELSE '[]'::jsonb END);
  END IF;
  IF operation = 'household_action' THEN
    action := payload->>'action';
    id := (payload->>'id')::uuid;
    PERFORM webapp.http_assert(member.role = 'owner' OR action = 'leave', 'Only owners manage household membership.', 'FORBIDDEN');
    PERFORM webapp.http_assert(NOT webapp.http_oauth_busy(actor), 'Authorization is in progress. Please try again.', 'OAUTH_BUSY');
    IF action = 'invite' THEN
      INSERT INTO webapp.invitations (id, "householdId", hash, "expiresAt") VALUES ((payload->>'invitation_id')::uuid, h, payload->>'invitation_hash', (payload->>'expires_at')::timestamptz);
      RETURN jsonb_build_object('ok', true);
    END IF;
    PERFORM webapp.http_assert(id IS NOT NULL OR action = 'leave', 'Select a record.');
    IF action = 'revoke-invite' THEN
      UPDATE webapp.invitations SET revoked = true WHERE invitations.id = id AND "householdId" = h;
    ELSIF action IN ('approve', 'reject') THEN
      SELECT * INTO request FROM webapp.requests WHERE requests.id = id AND "householdId" = h;
      PERFORM webapp.http_assert(FOUND AND request.status = 'pending', 'Request is no longer pending.');
      IF action = 'approve' THEN
        PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(request."userId"::text));
        PERFORM webapp.http_assert(NOT webapp.http_oauth_busy(request."userId"), 'Authorization is in progress. Please try again.', 'OAUTH_BUSY');
        INSERT INTO webapp.members ("userId", "householdId", role, "displayName") VALUES (request."userId", h, 'member', request."displayName");
      END IF;
      UPDATE webapp.requests SET status = CASE WHEN action = 'approve' THEN 'approved' ELSE 'rejected' END WHERE requests.id = id;
    ELSIF action IN ('remove', 'leave', 'promote') THEN
      IF action = 'leave' THEN id := actor; END IF;
      PERFORM pg_advisory_xact_lock(hashtext('moneymap.oauth'), hashtext(id::text));
      PERFORM webapp.http_assert(NOT webapp.http_oauth_busy(id), 'Authorization is in progress. Please try again.', 'OAUTH_BUSY');
      SELECT * INTO target FROM webapp.members WHERE "userId" = id AND "householdId" = h;
      PERFORM webapp.http_assert(FOUND, 'Member not found.');
      IF action = 'promote' THEN
        UPDATE webapp.members SET role = 'owner' WHERE "userId" = id;
      ELSIF action = 'leave' AND (SELECT count(*) FROM webapp.members WHERE "householdId" = h) = 1 THEN
        DELETE FROM webapp.households WHERE households.id = h;
        SET CONSTRAINTS ALL IMMEDIATE;
        RETURN jsonb_build_object('ok', true);
      ELSE
        PERFORM webapp.http_assert(target.role <> 'owner' OR (SELECT count(*) FROM webapp.members WHERE "householdId" = h AND role = 'owner') > 1, 'Promote another owner before the last owner leaves.');
        UPDATE webapp.tokens SET revoked = true WHERE "householdId" = h AND "userId" = id;
        UPDATE webapp.grants SET revoked = true WHERE "householdId" = h AND "userId" = id;
        DELETE FROM webapp.members WHERE "userId" = id;
      END IF;
    ELSE
      PERFORM webapp.http_assert(false, 'Invalid household action.');
    END IF;
    UPDATE webapp.households SET revision = revision + 1 WHERE households.id = h;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF operation = 'connections' THEN
    RETURN jsonb_build_object(
      'tokens', (SELECT coalesce(jsonb_agg(to_jsonb(t) - 'hash'), '[]'::jsonb) FROM webapp.tokens t WHERE t."householdId" = h AND t."userId" = actor),
      'grants', (SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM webapp.grants g WHERE g."householdId" = h AND g."userId" = actor));
  END IF;
  IF operation = 'oauth_grant' OR (operation = 'connection_action' AND payload->>'action' = 'revoke-grant') THEN
    SELECT * INTO lease FROM webapp.http_oauth_leases WHERE user_id = actor AND lease_id = (payload->>'lease_id')::uuid AND expires_at > clock_timestamp();
    PERFORM webapp.http_assert(FOUND AND lease.household_id = h, 'Authorization has expired or membership changed.', 'FORBIDDEN');
  END IF;
  IF operation = 'oauth_grant' THEN
    PERFORM webapp.http_assert(h = (payload->>'household_id')::uuid, 'Membership has changed.', 'FORBIDDEN');
    INSERT INTO webapp.grants (id, "householdId", "userId", "clientId", permission, revoked)
    VALUES (gen_random_uuid(), h, actor, payload->>'client_id', payload->>'permission', false)
    ON CONFLICT ("householdId", "userId", "clientId") DO UPDATE SET permission = EXCLUDED.permission, revoked = false;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF operation = 'connection_action' THEN
    action := payload->>'action';
    id := (payload->>'id')::uuid;
    PERFORM webapp.http_assert(id IS NOT NULL, 'Select a connection.');
    IF action = 'create-token' THEN
      PERFORM webapp.http_assert(length(payload->>'name') BETWEEN 1 AND 80 AND (payload->>'expires_at')::timestamptz > now()
        AND (payload->>'expires_at')::timestamptz <= now() + interval '366 days', 'Invalid token.');
      INSERT INTO webapp.tokens (id, "householdId", "userId", name, hash, permission, "expiresAt")
      VALUES (id, h, actor, payload->>'name', payload->>'hash', payload->>'permission', (payload->>'expires_at')::timestamptz);
    ELSIF action = 'revoke-token' THEN
      UPDATE webapp.tokens SET revoked = true WHERE tokens.id = id AND "userId" = actor;
    ELSIF action = 'revoke-grant' THEN
      UPDATE webapp.grants SET revoked = true WHERE grants.id = id AND "userId" = actor RETURNING "clientId" INTO revoked_client;
    ELSE
      PERFORM webapp.http_assert(false, 'Invalid connection action.');
    END IF;
    RETURN jsonb_build_object('ok', true, 'clientId', revoked_client);
  END IF;
  PERFORM webapp.http_assert(false, 'Unknown database operation.');
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.moneymap(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moneymap(text, jsonb) TO service_role;

-- PostgreSQL requires the migration role to be a member to transfer ownership.
-- The grant exists only within this migration, and grants no runtime table access.
DO $$ BEGIN
  EXECUTE format('GRANT moneymap_app TO %I', current_user);
END $$;
GRANT CREATE ON SCHEMA public TO moneymap_app;
ALTER FUNCTION public.moneymap(text, jsonb) OWNER TO moneymap_app;
REVOKE CREATE ON SCHEMA public FROM moneymap_app;
DO $$ BEGIN
  EXECUTE format('REVOKE moneymap_app FROM %I', current_user);
END $$;
NOTIFY pgrst, 'reload schema';
