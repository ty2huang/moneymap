-- Drizzle models the relational schema. This migration owns the PostgreSQL and
-- Supabase invariants that cannot be represented in the TypeScript schema.

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

CREATE OR REPLACE FUNCTION webapp.request_join(invitation_hash text, requested_display_name text)
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
    RAISE EXCEPTION 'Missing application user context' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM webapp.members WHERE "userId" = actor_id) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO invitation
  FROM webapp.invitations
  WHERE hash = invitation_hash AND NOT revoked AND "expiresAt" > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO webapp.requests (id, "householdId", "userId", status, "displayName")
  VALUES (gen_random_uuid(), invitation."householdId", actor_id, 'pending', left(requested_display_name, 120))
  ON CONFLICT ("userId", "householdId") DO UPDATE
    SET status = 'pending', "displayName" = EXCLUDED."displayName"
    WHERE webapp.requests.status <> 'approved'
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

CREATE OR REPLACE FUNCTION webapp.oauth_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims jsonb := event->'claims';
  audience text := nullif(current_setting('app.oauth_audience', true), '');
BEGIN
  IF claims ? 'client_id' AND audience IS NOT NULL THEN
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
