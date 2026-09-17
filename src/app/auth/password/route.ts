import { z } from "zod";
import { getAppUrl } from "@/server/app-url";
import { body, failure, json } from "@/server/http";
import { supabaseServer } from "@/server/supabase";
import { ensure } from "@/domain/types";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return json({ error: { message: "Not found." } }, 404);
  }

  try {
    // Login must check Origin even if an Authorization header is supplied.
    ensure(
      request.headers.get("origin") === new URL(getAppUrl()).origin,
      "Request origin is not allowed.",
      "FORBIDDEN",
      403,
    );
    const credentials = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(4096),
      })
      .parse(await body(request));
    const client = await supabaseServer();
    const { data, error } = await client.auth.signInWithPassword(credentials);
    ensure(
      !error && data.session && data.user,
      "Sign-in failed. Check your email and password.",
      "UNAUTHORIZED",
      401,
    );
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
