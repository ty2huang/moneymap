# MoneyMap

MoneyMap is a TypeScript household finance app for shared budgeting, reimbursements, and household analytics. It supports manual transaction entry, account/category tracking, Google sign-in, and a shared REST + MCP API surface.

## Features

- Shared household accounts and member management
- Manual transactions, transfers, reimbursements, and refunds
- Account and category configuration with archive/hidden states instead of destructive deletes
- Analytics snapshots with explicit refresh behavior
- Supabase-backed persistence with encrypted household text fields
- OAuth-protected API and MCP endpoints

## Tech stack

- Next.js 16
- React 19 + TypeScript
- Supabase + PostgreSQL
- Drizzle ORM
- Vitest + Playwright

## Prerequisites

- Node.js 24 or later (CI and deployment use Node 24).
- pnpm matching the `packageManager` field in [package.json](package.json).
- Docker Desktop (or another Docker-compatible runtime), running before local setup.
- Google OAuth credentials for local sign-in. A hosted Supabase project is only
  needed for deployment.

## Local setup

Run these commands from the repository root.

1. Install dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Start local Supabase and initialize the database.

   Copy `.env.example` to `.env.local` if you haven't already. Local development
   supports both email/password and Google sign-in. Google is enabled by default
   in `supabase/config.toml`; set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `.env.local` before starting the stack.
   Email/password sign-in does not use OAuth redirects or require an OAuth audience.

   ```sh
   pnpm run db:start
   pnpm run db:reset
   pnpm exec supabase status
   ```

   - `db:start` starts the local Supabase services in Docker.
   - `db:reset` recreates the local database and applies the checked-in migrations.
     This deletes existing local data; use it for initial setup or an intentional reset.
   - `supabase status` displays the local API URL, database URL, Studio URL, and
     API keys. Keep this output handy for the next step.

3. Configure the app environment and database login.

   Fill in the values below in `.env.local`.

   Open the Studio URL printed by `supabase status` and use its SQL Editor to
   provision the local application role:

   ```sql
   ALTER ROLE moneymap_app
     WITH LOGIN
     PASSWORD 'replace-with-a-local-app-password'
     NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
   ```

   The migrations deliberately create this role without login access. Repeat
   this step after resetting the local database if the login has been removed.

   Fill in `.env.local` using the values from `supabase status`:

   | Variable                               | Local value / where to find it                                                                                                                                     |
   | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `NEXT_PUBLIC_SUPABASE_URL`             | API / project URL, normally `http://127.0.0.1:54321`                                                                                                               |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key from the local status output, not a hosted project's key                                                                                           |
   | `APP_HOST`                             | Optional local hostname or LAN address used by the fallback app URL, such as `192.168.1.25`.                                                                       |
   | `APP_URL`                              | Optional locally; defaults to `http://<APP_HOST>:<PORT>` or `http://localhost:3000` when neither is set. Set the deployed origin explicitly.                       |
   | `DATABASE_ADMIN_URL`                   | Database URL from status, normally `postgresql://postgres:postgres@127.0.0.1:54322/postgres`                                                                       |
   | `DATABASE_URL`                         | Same database host, port, and database, but use `moneymap_app` and the password set above: `postgresql://moneymap_app:<encoded-password>@127.0.0.1:54322/postgres` |
   | `MONEYMAP_MASTER_KEYS`                 | JSON map containing a generated encryption key, as shown below                                                                                                     |
   | `MONEYMAP_ACTIVE_KEY_VERSION`          | `1`                                                                                                                                                                |

   URL-encode special characters in the database password. Use the actual status
   output if your ports differ. The application requires the restricted
   `moneymap_app` role; the admin connection is only for administrative scripts.

   Generate a 32-byte encryption key:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Paste the result into `.env.local`:

   ```dotenv
   MONEYMAP_MASTER_KEYS='{"1":"<generated-base64-key>"}'
   MONEYMAP_ACTIVE_KEY_VERSION=1
   ```

   Keep the key while retaining the database. For existing encrypted records, use
   the existing key map or the [key rotation flow](docs/operations.md#key-rotation).

4. Create test users in local Supabase Studio under **Authentication > Users**.
   Use **Add user > Create new user**, choose an email and password, and mark the
   email confirmed. Create separate users for household membership testing.
   These are real Auth users; no authentication or database access checks are
   bypassed. Keep their passwords out of Git. Recreate users after a database reset.

5. Start the app:

   ```sh
   pnpm run dev
   ```

   Open the URL printed by Next and use **Sign in with email**. The form and
   endpoint are available only in development, not with `pnpm run start`.
   No `auth:configure` command or OAuth redirects are needed for this flow.

   For parallel worktrees, leave `APP_URL` blank and let Next select an available
   port, or use `pnpm run dev --port 3101`. The app URL uses that selected port.
   For a browser on another machine, set `APP_HOST` in `.env.local` to a reachable
   hostname or LAN address, and use a browser-reachable `NEXT_PUBLIC_SUPABASE_URL`
   for session refresh and Realtime. Use disposable test credentials over LAN HTTP.
   Worktrees sharing a Supabase database share test data. Browser cookies are not
   isolated by port: use separate browser profiles to test different users.

### Optional OAuth integration testing

Reserve a stable app origin for OAuth tests. Google sign-in is already enabled
in `supabase/config.toml`. Configure its client ID and secret environment
variables, and follow the
[Google setup guide](docs/operations.md#4-configure-google-sign-in-and-redirects).
Allow the app's `/auth/callback` URL in Supabase. Restart the local Supabase stack
after changing its configuration; a database reset is not needed for that change.
Hosted Supabase Auth settings are configured separately in the dashboard, as
described in the deployment guide; this local config file does not need a
separate production version.

For REST/MCP OAuth, configure the Supabase Site URL for the consent page and run
`PORT=3000 pnpm run auth:configure` for the reserved origin. This reads `.env.local`
and stores the resolved app origin in `webapp.oauth_configuration`. There is one
OAuth audience per database: do not rerun this for each feature worktree. Repeat
it only after a database reset or an intentional OAuth origin change. Ordinary
email/password sign-in and personal API tokens do not need this audience.

## API and MCP

- OpenAPI docs: `/api/openapi`
- REST endpoints: `/api/v1/accounts`, `/categories`, `/transactions`, `/transfers`, `/analytics`, `/export`
- MCP endpoint: `/mcp` using Streamable HTTP
- Protected resource metadata: `/.well-known/oauth-protected-resource`

The app accepts OAuth or personal tokens in the `Authorization: Bearer ...` header and enforces household membership and permission checks on each request.

## Verification

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm exec playwright install chromium
pnpm run test:e2e
```

Install Chromium before running the browser tests (and again after Playwright
upgrades). On Linux, use `pnpm exec playwright install --with-deps chromium`
if browser system dependencies are missing. The browser tests start a local
production server using the build above.

Run database integration tests separately:

```sh
pnpm run test:integration
```

`pnpm test` runs the unit suite; database-backed tests are skipped unless `TEST_DATABASE_URL` is configured. Set `TEST_DATABASE_URL` in `.env.local` to an isolated test database before running `test:integration`. The integration flow can use an existing PostgreSQL instance or start a disposable local container; never use the app or production database for these tests.

## Deployment and operations

For deployment and operational procedures, see [docs/operations.md](docs/operations.md). Production setup requires a Vercel project, a Supabase project, and valid Google OAuth configuration.

## License

This project is licensed under the [MIT License](LICENSE).
