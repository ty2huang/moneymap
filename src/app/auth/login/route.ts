import { supabaseServer } from "@/server/supabase";
import { safeReturnPath } from "@/server/redirect";
import { getAppUrl } from "@/server/app-url";
export async function GET(request: Request) {
  const client = await supabaseServer(),
    next = new URL(request.url).searchParams.get("next") ?? "/";
  const appUrl = getAppUrl();
  const safe = safeReturnPath(next, appUrl);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(safe)}`,
    },
  });
  return Response.redirect(
    error || !data.url ? `${appUrl}/?authError=1` : data.url,
  );
}
