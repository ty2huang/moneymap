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

   Copy `.env.example` to `.env.local` if you haven't already. Google is enabled
   in `supabase/config.toml`, so fill in these credentials before starting the
   local stack. The remaining values can be configured in step 3:

   ```dotenv
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<google-client-id>
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<google-client-secret>
   ```

   Create a Google Web application OAuth client as described in the
   [Google setup guide](docs/operations.md#4-configure-google-sign-in-and-redirects),
   using `http://localhost:3000` as the JavaScript origin and
   `http://127.0.0.1:54321/auth/v1/callback` as the authorized redirect URI
   for the default local stack. Add your account as a test user if needed.

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

   Keep the Google credentials in `.env.local` and fill in the remaining values
   below in the same file.

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
   | `APP_URL`                              | `http://localhost:3000`, without a trailing slash                                                                                                                  |
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

4. Configure the local OAuth audience:

   ```sh
   pnpm run auth:configure
   ```

   This reads `APP_URL` and `DATABASE_ADMIN_URL` from `.env.local`, stores the
   origin in `webapp.oauth_configuration`, and verifies it. Run it after migrations
   and environment setup, and again after a database reset or origin change.
   The local token hook and OAuth server are enabled in `supabase/config.toml`.

5. Start the app:

   ```sh
   pnpm run dev
   ```

   Open `http://localhost:3000` and sign in with Google.

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
