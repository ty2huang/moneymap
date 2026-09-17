import { supabaseServer } from "@/server/supabase";
import { safeReturnPath } from "@/server/redirect";
import { getAppUrl } from "@/server/app-url";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code"),
    next = url.searchParams.get("next") ?? "/";
  const appUrl = getAppUrl();
  if (code) {
    const client = await supabaseServer();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      return Response.redirect(new URL(safeReturnPath(next, appUrl), appUrl));
    }
  }
  return Response.redirect(`${appUrl}/?authError=1`);
}
