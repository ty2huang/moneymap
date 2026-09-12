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

- Node.js 22.13+
- pnpm 12.3.4
- A Supabase project

## Local setup

1. Install dependencies:

```sh
pnpm install
```

2. Copy `.env.example` to `.env.local` and configure the required values.

Required environment variables include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APP_URL` (for example `http://localhost:3000`)
- `DATABASE_URL`
- `DATABASE_ADMIN_URL`
- `MONEYMAP_MASTER_KEYS`
- `MONEYMAP_ACTIVE_KEY_VERSION`

`MONEYMAP_MASTER_KEYS` should contain a JSON object keyed by version, for example:

```dotenv
MONEYMAP_MASTER_KEYS='{"1":"<base64-encoded-32-byte-key>"}'
MONEYMAP_ACTIVE_KEY_VERSION=1
```

Keep the key backup secure. If records already exist, use the key rotation flow instead of replacing existing versions.

3. Start the local Supabase stack and apply the schema:

```sh
pnpm run db:start
pnpm run db:reset
pnpm run auth:configure
```

4. Start the app:

```sh
pnpm run dev
```

Open `http://localhost:3000`.

## Supabase and auth configuration

- Enable Google authentication in Supabase and configure the OAuth callback to your app origin.
- Set the app's site URL to `APP_URL` and allow the callback path `/auth/callback`.
- Use a restricted `moneymap_app` database user for application queries; do not use `postgres`, a table owner, `service_role`, or a role with `BYPASSRLS`.
- Apply the migrations with `pnpm run db:migrate` from the linked Supabase project. The migrations create `moneymap_app` as `NOLOGIN` by design; provision its login and password separately with a privileged database session, as described in [the operations runbook](docs/operations.md#deploy-to-vercel).
- Set `DATABASE_URL` to a connection string for the password-protected `moneymap_app` role. Keep `DATABASE_ADMIN_URL` out of the deployed application; it is reserved for administrative migration, restore, and key-rotation tooling.
- Configure the custom access token hook and store the exact `APP_URL` origin in
  `webapp.oauth_configuration`. For local development, run
  `pnpm run auth:configure` after applying the migrations. The command reads
  `APP_URL` and `DATABASE_ADMIN_URL` from `.env.local`, stores the app origin as
  the audience, and verifies it before returning.
- The app requires a real OAuth-backed household flow; there is no hidden demo login or bypass.

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
pnpm run test:e2e
```

Useful commands:

```sh
pnpm run test:integration
pnpm exec playwright install chromium
```

`pnpm test` runs the unit suite; database-backed tests are skipped unless `TEST_DATABASE_URL` is configured. The integration flow can use an existing PostgreSQL instance or start a disposable local container.

## Deployment and operations

For deployment and operational procedures, see [docs/operations.md](docs/operations.md). Production setup requires a Vercel project, a Supabase project, and valid Google OAuth configuration.

## Privacy and security

- Descriptions, comments, and account/bank names are encrypted with AES-256-GCM under per-household keys.
- Amounts, dates, category names, member identities, and general metadata remain queryable by an administrator.
- This is not end-to-end encryption: a server or key holder can decrypt text fields.
- There are no bank-connections, tracking scripts, or session replay integrations in the app.

## License

This project is licensed under the [MIT License](LICENSE).
