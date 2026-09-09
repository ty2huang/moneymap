# Deployment and recovery

## Deploy to Vercel

1. Create a Vercel project for this repository, using the Next.js preset and Node 24. Link it with `vercel link` after logging in.
2. Use distinct development/preview and production Supabase projects. Never point preview deployments at production financial data.
3. Link the intended project and apply `supabase/migrations` with `pnpm run db:migrate`. Configure the restricted application login and Supabase Auth/Realtime as described in the README.
4. Configure the public Supabase settings, `APP_URL`, `DATABASE_URL`, `MONEYMAP_MASTER_KEYS`, `MONEYMAP_ACTIVE_KEY_VERSION`, and `OAUTH_AUDIENCE` in Vercel. Do not deploy `DATABASE_ADMIN_URL` or test variables. The master key map is a server-only secret, never a `NEXT_PUBLIC_` value.
5. Match application, database, and authentication regions where feasible. Configure exact OAuth callback origins. Use a stable preview origin for OAuth testing; arbitrary preview URLs are not automatically trusted.
6. Run type checks, domain/integration tests, the production build, and browser tests. Deploy with `vercel --prod` only against the intended project.
7. Smoke-test real sign-in, join approval, CRUD, realtime changes across two users, analytics refresh, personal-token revocation, and OAuth/MCP consent. Check unauthenticated API requests return no financial data.

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
