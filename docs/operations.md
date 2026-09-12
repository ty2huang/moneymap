# Deployment and recovery

## Deploy to Vercel

Vercel runs the Next.js application and its REST/MCP endpoints. Supabase hosts
PostgreSQL, Auth, and Realtime. Run the commands below from the repository root;
the database commands are manual deployment steps, not Vercel build commands.

### 1. Prepare the repository and projects

Use Node 24 and the pnpm version pinned in `package.json`.
Install dependencies with `pnpm install --frozen-lockfile`, and push the intended
release, including `pnpm-lock.yaml` and `supabase/migrations`, to your Git provider.
Keep `.env.local` and credentials out of Git.

Create a production Supabase project and save its database password securely.
Record its project reference, project URL, and publishable API key from the
dashboard. Use distinct development/preview and production Supabase projects.
Never point preview deployments at production financial data. Match the Vercel
Functions region to the Supabase region where feasible.

In Vercel, choose **Add New > Project** and import this repository. Configure:

| Setting          | Value                                   |
| ---------------- | --------------------------------------- |
| Framework preset | Next.js                                 |
| Root directory   | Repository root                         |
| Node.js version  | 24.x                                    |
| Build command    | `pnpm run build`                        |
| Install command  | Automatic (leave the override disabled) |
| Output directory | Framework default                       |

Complete the environment and database setup below before deploying. Choose a
stable production domain, either a custom domain or the assigned production
`*.vercel.app` domain. The examples use `https://money.example`; replace it with
your actual origin everywhere, without a trailing slash or path. This value is
`APP_URL`. Verify the assigned domain after deployment and correct the settings
if it differs from the planned name.

### 2. Apply the hosted database migrations

Log in with the repository's Supabase CLI and link the intended project:

```sh
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase migration list
pnpm exec supabase db push --dry-run
pnpm run db:migrate
```

Check the linked project and pending migrations before the final command, which
runs `supabase db push`. A hosted deployment does not require `db:start` or
`db:reset`. Applying migrations does not activate the hosted Auth settings from
`supabase/config.toml`; configure those explicitly in steps 4 and 5.

### 3. Provision the application database connection

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

Open the Supabase **Connect** dialog and copy the shared **transaction pooler**
connection string. Preserve the actual host, use `moneymap_app.<project-ref>` as
the username, and use the application role's password from above:

```text
postgresql://moneymap_app.<project-ref>:<url-encoded-app-password>@<pooler-host>:6543/postgres?sslmode=require
```

This is `DATABASE_URL`. URL-encode special characters in the password. The
application already disables prepared statements (`prepare: false`) for
transaction pooling and rejects application queries using an unrestricted role.

### 4. Configure Google sign-in and redirects

In Google Auth Platform, configure the consent screen and create an OAuth client
of type **Web application**. Add test users if the consent screen is in Testing
mode. Add the application origin as an authorized JavaScript origin. For the
authorized redirect URI, copy the callback shown in Supabase's Google provider
settings, normally:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

In Supabase **Authentication > Sign In / Providers > Google**, enable the provider
and save the Google client ID and secret. These hosted credentials belong in
Supabase, not Vercel's environment variables.

In **Authentication > URL Configuration**, set:

| Setting       | Value                                 |
| ------------- | ------------------------------------- |
| Site URL      | `https://money.example`               |
| Redirect URLs | `https://money.example/auth/callback` |

Google redirects to Supabase's `/auth/v1/callback`; Supabase then redirects to
MoneyMap's `/auth/callback`. They are different settings.

### 5. Configure the OAuth server and access-token hook

For the OAuth-protected REST/MCP flow, open **Authentication > OAuth Server**:

- Enable the OAuth 2.1 server.
- Set the authorization path to `/oauth/consent`; MoneyMap implements this page.
- Enable dynamic client registration to match `supabase/config.toml`.
- In JWT signing-key settings, verify the active key uses an asymmetric algorithm
  such as ES256 or RS256. MoneyMap verifies OAuth bearer tokens using the public
  JWKS endpoint, so a legacy symmetric HS256 key is insufficient for that flow.

Store the OAuth audience as the exact application origin from the Supabase SQL
Editor after applying the migrations:

```sql
INSERT INTO webapp.oauth_configuration (singleton, audience)
VALUES (true, 'https://money.example')
ON CONFLICT (singleton) DO UPDATE
SET audience = EXCLUDED.audience;

SELECT audience
FROM webapp.oauth_configuration
WHERE singleton;
```

Verify that the query returns the same origin as `APP_URL`. Then open
**Authentication > Hooks** and enable the **Custom Access Token** hook using the
PostgreSQL function `webapp.oauth_token_hook`. The migrations create the function
and grants; selecting it in hosted Auth activates the hook.

### 6. Check Realtime and generate the encryption key

Ensure Realtime is enabled. MoneyMap uses private Broadcast channels, not
Postgres Changes subscriptions. The migrations install its broadcast triggers
and the `moneymap_receive_changes` policy on `realtime.messages`; there is no need
to add all `webapp` tables to a Postgres Changes publication or expose the
`webapp` schema through the Data API.

For a fresh database, generate a 32-byte encryption key locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Save it securely and use it in the JSON map below. For a restored database, use
the existing key map instead; a newly generated key cannot decrypt old records.

### 7. Configure Vercel environment variables

Add these values for **Production** in the import screen or project environment
settings. Configure Preview separately using its own Supabase project and keys.

| Variable                               | Value                                                |
| -------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co`                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable API key                         |
| `APP_URL`                              | `https://money.example`                              |
| `DATABASE_URL`                         | Restricted transaction-pooler connection from step 3 |
| `MONEYMAP_MASTER_KEYS`                 | `{"1":"<base64-encoded-32-byte-key>"}`               |
| `MONEYMAP_ACTIVE_KEY_VERSION`          | `1`                                                  |

Paste the encryption JSON directly into Vercel, without the surrounding single quotes used
in `.env.local` examples.

`DATABASE_URL` must use the password-protected `moneymap_app` login, not
`postgres`, a table owner, `service_role`, or a role with `BYPASSRLS`.
URL-encode special characters in the password when constructing the connection
string. Do not deploy `DATABASE_ADMIN_URL`, `TEST_DATABASE_URL`, or other test
variables, or the local `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` variables.
`MONEYMAP_MASTER_KEYS` is server-only and must never use a `NEXT_PUBLIC_` name.

### 8. Verify and deploy

With a development environment configured locally, run:

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm exec playwright install chromium
pnpm run test:e2e
```

The browser-test command starts a local production server by default. Run
`pnpm run test:integration` with `TEST_DATABASE_URL` pointing to an isolated test
database; the integration flow may start a disposable local container. These
checks do not replace hosted authentication and Realtime verification.

Click **Deploy** in Vercel. For CLI deployment instead, install the Vercel CLI,
run `vercel login` and `vercel link`, verify the linked project, then run
`vercel --prod`. Redeploy after changing environment variables; public Next.js
variables are included in the build.

On the stable production URL, smoke-test:

- Google sign-in and return to the production app.
- Household creation, join approval, and account/category/transaction CRUD.
- Reading encrypted names and descriptions after a reload.
- Realtime changes across two signed-in users and analytics refresh.
- Personal-token revocation and OAuth/MCP consent.
- `/api/openapi` and `/.well-known/oauth-protected-resource`.
- Unauthenticated `/api/v1/accounts` requests returning no financial data.

The build uses webpack explicitly because Turbopack's CSS worker requires local port permissions that are unavailable in some sandboxed environments. This does not change the application runtime.

### Preview deployments and subsequent releases

Use a stable preview origin and configure its `APP_URL`, Supabase Site URL,
callback, and database OAuth audience together. Arbitrary Vercel preview URLs
are not automatically trusted: MoneyMap checks request origins and stores one
OAuth audience per database. Adding a redirect wildcard alone does not solve
this. When changing the production domain, update these same settings together.

For subsequent releases, apply new migrations to the intended Supabase project
before deploying application code that requires them. With Git integration,
coordinate this before pushing or merging to Vercel's production branch, which
triggers deployment. Build production with production environment values rather
than promoting a preview artifact built against a different Supabase project.

### Deployment troubleshooting

| Symptom                                            | Check                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Google reports a redirect mismatch                 | Google's redirect URI must be Supabase's provider callback                                                                                                                    |
| Sign-in returns to localhost or another deployment | `APP_URL`, Supabase Site URL, and allowed app callback                                                                                                                        |
| Writes return an origin error                      | Open the exact origin configured in `APP_URL`                                                                                                                                 |
| Database login or role errors                      | Pooler host, `moneymap_app.<project-ref>` username, encoded password, and role login state                                                                                    |
| OAuth bearer tokens are rejected                   | Active asymmetric signing key, token hook, audience, and a fresh OAuth token                                                                                                  |
| Encrypted fields cannot be read                    | Correct master-key versions for the database                                                                                                                                  |
| Live updates are missing                           | Realtime enabled, broadcast triggers/policy installed, and both users authorized                                                                                              |
| Wrong pnpm version during build                    | Commit `pnpm-lock.yaml`, leave Install Command automatic, and check the selected version in build logs |

Use Vercel build/runtime logs and Supabase Auth logs to investigate; follow the
logging restrictions below.

### Platform references

Platform settings were checked against these official guides on 2026-09-12:

- [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Database connections and pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel package managers](https://vercel.com/docs/package-managers)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)

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

Supabase tracks applied migration versions in `supabase_migrations.schema_migrations`.
Add a new migration for changes; do not rely on `db push` to detect or reapply edits
to an already applied migration. Production rollback should use a compatible
application release or a forward database correction, not blind schema deletion.

## Verification limits

Local PostgreSQL tests cover the real restricted-role persistence and financial services. Browser tests use synthetic HTTP fixtures to validate interaction and refresh behavior. Real Google authentication, Supabase websocket delivery, OAuth client interoperability, and hosted restore operations require a configured Supabase/Vercel environment and must pass the smoke tests before launch.
