# Deployment and recovery

## Deploy to Vercel

1. Create a Vercel project for this repository, using the Next.js preset and Node 24. Log in and link the local checkout with `vercel link`; verify that it points to the intended project before deploying.
2. Use distinct development/preview and production Supabase projects. Never point preview deployments at production financial data.
3. Log in to the Supabase CLI, link the intended project, and apply `supabase/migrations`:

```sh
supabase login
supabase link --project-ref <project-ref>
pnpm run db:migrate
```

The migration creates the restricted `moneymap_app` role and its grants, but deliberately creates it as `NOLOGIN`. It does not set a password, and rerunning it does not change the login state or password of an existing role. After the migration succeeds, provision the application login from a privileged database session, such as the production Supabase SQL Editor:

```sql
ALTER ROLE moneymap_app
  WITH LOGIN
  PASSWORD 'generate-a-strong-unique-password'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;
```

Use a different generated password for each environment. Do not put the password in Git, a migration file, or a client-visible variable. Verify the role before configuring the app:

```sql
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'moneymap_app';
```

The expected values are `rolcanlogin = true`, `rolsuper = false`, and `rolbypassrls = false`.

4. Configure Supabase Auth, Realtime, and the custom access-token hook as
   described in the README. Store the OAuth audience as the exact application
   origin from a privileged SQL session after applying the migrations:

```sql
INSERT INTO webapp.oauth_configuration (singleton, audience)
VALUES (true, 'https://money.example')
ON CONFLICT (singleton) DO UPDATE
SET audience = EXCLUDED.audience;

SELECT audience
FROM webapp.oauth_configuration
WHERE singleton;
```

Use the real origin for each environment and verify that the query returns the
same value as `APP_URL`. Configure the exact application origin and
`/auth/callback` redirect. A stable preview origin is recommended for OAuth
testing; arbitrary Vercel preview URLs are not automatically trusted.

5. Configure these Vercel environment variables separately for Preview and Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APP_URL`
- `DATABASE_URL`
- `MONEYMAP_MASTER_KEYS`
- `MONEYMAP_ACTIVE_KEY_VERSION`

`DATABASE_URL` must use the password-protected `moneymap_app` login, not
`postgres`, a table owner, `service_role`, or a role with `BYPASSRLS`.
URL-encode special characters in the password when constructing the connection
string. Do not deploy `DATABASE_ADMIN_URL`, `TEST_DATABASE_URL`, or other test
variables. `MONEYMAP_MASTER_KEYS` is server-only and must never use a
`NEXT_PUBLIC_` name.

6. Match application, database, and authentication regions where feasible. Run
   type checks, domain/integration tests, the production build, and browser
   tests. Deploy with `vercel --prod` only against the intended project.
7. Smoke-test real sign-in, join approval, CRUD, realtime changes across two
   users, analytics refresh, personal-token revocation, and OAuth/MCP consent.
   Check unauthenticated API requests return no financial data.

The build uses webpack explicitly because Turbopack's CSS worker requires local port permissions that are unavailable in some sandboxed environments. This does not change the application runtime.

## Monitoring

Monitor HTTP error rates and availability through the host's built-in tools. Never log request bodies, Authorization headers, cookies, user emails, decrypted financial fields, database URLs, or encryption keys. Application audit rows contain actor/action/record/time metadata only. Disable request-body capture in any subsequently added monitoring service.

## Backups and restore rehearsal

Enable managed database backups. Back up the complete database (including Auth, memberships, wrapped keys, and `webapp` tables), and keep versioned master keys separately in a secure password manager or secret store. A CSV export is not a full backup.

Before launch and periodically afterward:

1. Restore a database backup into an isolated project with outbound integrations disabled.
2. Restore the corresponding encryption-key versions to an isolated application environment.
3. Provision the restricted database login and verify its RLS behavior; role passwords are not part of a normal `pg_dump`.
4. Verify decrypted account names/comments, transaction counts, reimbursement allocations, and monthly totals against the backup source.
5. Confirm a second household cannot access the restored records. Reconfigure Auth callbacks and Realtime for the isolated origin rather than reusing production redirect settings.
6. Record the result and remove the isolated restore project when finished.

## Key rotation

Add a new 32-byte key version to `MONEYMAP_MASTER_KEYS` while retaining old versions. Change `MONEYMAP_ACTIVE_KEY_VERSION` to the new version. With the full key map and migration-only database credentials available, run:

```sh
node --env-file=.env.local --import tsx scripts/rotate-keys.ts
```

The script locks household rows and rewraps data keys in one transaction. It does not rewrite every transaction. Verify reads afterward. Retain old key versions as long as retained database backups need them; removing an old key immediately makes those backups unreadable.

## Schema evolution

`src/db/schema.ts` describes the relational tables. After changing it, run `pnpm run db:generate -- <descriptive_name>`. The bridge runs Drizzle Kit, retains its SQL and snapshots in `drizzle`, asks the Supabase CLI to create a correctly timestamped migration, and copies the generated SQL into `supabase/migrations`. Review both outputs, test with `pnpm run db:reset`, then deploy with `pnpm run db:migrate`.

For RLS policies, deferred triggers, Realtime/Auth integration, or other SQL Drizzle cannot model, create a migration with `pnpm run db:new -- <descriptive_name>` and edit the resulting file in `supabase/migrations`. Those custom migrations are applied in the same Supabase history as the generated schema migrations.

The migration runner records checksums and rejects edits to applied migrations. Add a new migration for changes; do not rewrite deployed history. Production rollback should use a compatible application release or a forward database correction, not blind schema deletion.

## Verification limits

Local PostgreSQL tests cover the real restricted-role persistence and financial services. Browser tests use synthetic HTTP fixtures to validate interaction and refresh behavior. Real Google authentication, Supabase websocket delivery, OAuth client interoperability, and hosted restore operations require a configured Supabase/Vercel environment and must pass the smoke tests before launch.
