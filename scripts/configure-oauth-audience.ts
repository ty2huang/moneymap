import postgres from "postgres";

function requiredAppOrigin() {
  const value = process.env.APP_URL;
  if (!value) {
    throw new Error("APP_URL is required.");
  }

  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("APP_URL must be an HTTP(S) origin without a path.");
  }

  return url.origin;
}

async function main() {
  const databaseUrl = process.env.DATABASE_ADMIN_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_ADMIN_URL is required.");
  }

  const appOrigin = requiredAppOrigin();

  const admin = postgres(databaseUrl, { max: 1 });
  try {
    const [database] = await admin<{ name: string }[]>`
      select current_database() as name
    `;

    await admin`
      insert into webapp.oauth_configuration (singleton, audience)
      values (true, ${appOrigin})
      on conflict (singleton) do update
      set audience = excluded.audience
    `;

    const [configuration] = await admin<{ audience: string }[]>`
      select audience
      from webapp.oauth_configuration
      where singleton
    `;

    if (configuration.audience !== appOrigin) {
      throw new Error("PostgreSQL did not retain the OAuth audience.");
    }

    console.log(
      `Configured the OAuth audience for ${database.name} as ${appOrigin}.`,
    );
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42P01"
    ) {
      throw new Error(
        "webapp.oauth_configuration does not exist. Apply the database migrations before running auth:configure.",
      );
    }

    throw error;
  } finally {
    await admin.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
