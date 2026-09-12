import { authenticate, sameOrigin, firstParty } from "@/server/auth";
import { configured, supabaseServer } from "@/server/supabase";
import { session } from "@/server/household-service";
import { json, failure } from "@/server/http";
export async function GET() {
  if (!configured()) {
    return json({ configured: false });
  }
  try {
    return json({ configured: true, ...(await session(await authenticate())) });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    firstParty(await authenticate(request));
    const client = await supabaseServer();
    await client.auth.signOut();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
