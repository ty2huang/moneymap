import { authenticate, sameOrigin } from "@/server/auth";
import {
  householdInfo,
  createHousehold,
  requestJoin,
  householdAction,
} from "@/server/household-service";
import { json, failure, body } from "@/server/http";
export async function GET() {
  try {
    return json(await householdInfo(await authenticate()));
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
      x.action === "create"
        ? await createHousehold(p, x.data)
        : x.action === "join"
          ? await requestJoin(p, x.data)
          : await householdAction(p, x),
    );
  } catch (e) {
    return failure(e);
  }
}
