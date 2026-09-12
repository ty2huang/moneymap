import { createRemoteJWKSet, jwtVerify } from "jose";
import { sql } from "drizzle-orm";
import { db } from "./database";
import { hash } from "./crypto";
import { supabaseServer } from "./supabase";
import { ensure } from "@/domain/types";
export type Principal = {
  userId: string;
  displayName?: string;
  clientId?: string;
  householdId?: string;
  permission?: "read" | "write";
  tokenId?: string;
};
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function authenticate(request?: Request): Promise<Principal> {
  const bearer = request?.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  ensure(
    !request?.headers.has("authorization") || bearer,
    "Invalid Authorization header.",
    "UNAUTHORIZED",
    401,
  );
  if (bearer?.startsWith("mm_")) {
    const result = await db().execute(
      sql`select * from webapp.resolve_token(${hash(bearer)})`,
    );
    const row = result[0];
    ensure(row, "Token is expired or revoked.", "UNAUTHORIZED", 401);
    return {
      userId: String(row.user_id),
      householdId: String(row.household_id),
      permission: row.permission as "read" | "write",
      tokenId: String(row.id),
    };
  }
  if (bearer) {
    const issuer = process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1";
    const appUrl = process.env.APP_URL;
    ensure(appUrl, "APP_URL is required.", "INTERNAL", 500);
    jwks ??= createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"));
    let payload;
    try {
      ({ payload } = await jwtVerify(bearer, jwks, {
        issuer,
        audience: new URL(appUrl).origin,
      }));
    } catch {
      ensure(false, "Invalid access token.", "UNAUTHORIZED", 401);
    }
    ensure(
      payload?.sub && typeof payload.client_id === "string",
      "An OAuth access token is required.",
      "UNAUTHORIZED",
      401,
    );
    return { userId: payload.sub, clientId: payload.client_id };
  }
  const client = await supabaseServer();
  const { data, error } = await client.auth.getUser();
  ensure(!error && data.user, "Sign in to continue.", "UNAUTHORIZED", 401);
  return {
    userId: data.user.id,
    displayName: String(
      data.user.user_metadata?.full_name ??
        data.user.user_metadata?.name ??
        "Member",
    ).slice(0, 120),
  };
}
export function sameOrigin(request: Request) {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(request.method) ||
    request.headers.has("authorization")
  )
    return;
  ensure(
    request.headers.get("origin") === new URL(process.env.APP_URL!).origin,
    "Request origin is not allowed.",
    "FORBIDDEN",
    403,
  );
}
export function firstParty(p: Principal) {
  ensure(
    !p.clientId && !p.tokenId,
    "Use MoneyMap to manage household access.",
    "FORBIDDEN",
    403,
  );
}
