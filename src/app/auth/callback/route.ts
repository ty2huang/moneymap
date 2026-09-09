import { supabaseServer } from "@/server/supabase";
import { safeReturnPath } from "@/server/redirect";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    next = url.searchParams.get("next") ?? "/";
  if (code) {
    const client = await supabaseServer();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return Response.redirect(
        new URL(
          safeReturnPath(next, process.env.APP_URL!),
          process.env.APP_URL,
        ),
      );
  }
  return Response.redirect(`${process.env.APP_URL}/?authError=1`);
}
