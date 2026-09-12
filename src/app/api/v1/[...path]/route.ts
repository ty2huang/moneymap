import { authenticate, sameOrigin } from "@/server/auth";
import { readResource, writeResource } from "@/server/api-service";
import { json, failure, body } from "@/server/http";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    sameOrigin(request);
    const p = await authenticate(request),
      { path } = await params;
    if (path.length > 2) {
      return json(
        { error: { code: "NOT_FOUND", message: "Route not found." } },
        404,
      );
    }
    if (request.method === "GET") {
      const result = await readResource(
        p,
        path[0],
        Object.fromEntries(new URL(request.url).searchParams),
        path[1],
      );
      if (path[0] === "export") {
        return new Response(result as string, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="moneymap-transactions.csv"',
            "Cache-Control": "private, no-store",
          },
        });
      }
      return json(result);
    }
    return json(
      await writeResource(
        p,
        path[0],
        request.method,
        path[1],
        await body(request),
        request.headers.get("idempotency-key") ?? undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
