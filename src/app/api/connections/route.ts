import { authenticate, sameOrigin } from "@/server/auth";
import { connections, connectionAction, consent } from "@/server/connections";
import { json, failure, body } from "@/server/http";
export async function GET() {
  try {
    return json(await connections(await authenticate()));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const p = await authenticate(request),
      x = await body(request);
    return json(
      x.action === "consent"
        ? await consent(p, x.data)
        : await connectionAction(p, x),
    );
  } catch (e) {
    return failure(e);
  }
}
