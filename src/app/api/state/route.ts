import { authenticate, firstParty, sameOrigin } from "@/server/auth";
import { snapshot, mutate } from "@/server/ledger-service";
import { aggregate } from "@/domain/analytics";
import { reportInput, commandSchema } from "@/domain/contracts";
import { json, failure, body } from "@/server/http";
export async function GET(request: Request) {
  try {
    const p = await authenticate(request);
    firstParty(p);
    const s = await snapshot(p),
      params = Object.fromEntries(new URL(request.url).searchParams);
    if (params.report) {
      delete params.report;
      return json(
        aggregate(s.ledger, reportInput.parse(params), s.household.revision),
      );
    }
    return json(s);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const p = await authenticate(request);
    firstParty(p);
    return json(
      await mutate(
        p,
        commandSchema.parse(await body(request)),
        request.headers.get("idempotency-key") ?? undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
