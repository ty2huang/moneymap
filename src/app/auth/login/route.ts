import { supabaseServer } from "@/server/supabase";
import { safeReturnPath } from "@/server/redirect";
export async function GET(request: Request) {
  const client = await supabaseServer(),
    next = new URL(request.url).searchParams.get("next") ?? "/";
  const safe = safeReturnPath(next, process.env.APP_URL!);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.APP_URL}/auth/callback?next=${encodeURIComponent(safe)}`,
    },
  });
  return Response.redirect(
    error || !data.url ? `${process.env.APP_URL}/?authError=1` : data.url,
  );
}
