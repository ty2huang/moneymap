import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { authenticate } from "@/server/auth";
import { readResource } from "@/server/api-service";
import { mutate } from "@/server/ledger-service";
import { commandSchema } from "@/domain/contracts";
import { failure } from "@/server/http";
export const runtime = "nodejs";
async function toolResult(fn: () => Promise<unknown>) {
  try {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(await fn()) }],
    };
  } catch (e) {
    const response = failure(e);
    return {
      isError: true,
      content: [{ type: "text" as const, text: await response.text() }],
    };
  }
}
export async function POST(request: Request) {
  try {
    if (!request.headers.has("authorization"))
      return new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${process.env.APP_URL}/.well-known/oauth-protected-resource"`,
        },
      });
    const p = await authenticate(request);
    const server = new McpServer({ name: "MoneyMap", version: "1.0.0" });
    server.registerTool(
      "read_finances",
      {
        description:
          "Read household accounts, categories, transactions, transfers, or analytics. Amounts are decimal strings. Analytics requires from and to dates.",
        inputSchema: {
          resource: z.enum([
            "accounts",
            "categories",
            "transactions",
            "transfers",
            "analytics",
          ]),
          filters: z.record(z.string(), z.string()).optional(),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ resource, filters }) =>
        toolResult(() => readResource(p, resource, filters)),
    );
    server.registerTool(
      "write_finances",
      {
        description:
          "Create, update, or delete household financial records. Edits/deletes require the current version. Refund allocations use expenseId and decimal amount. Requires write permission.",
        inputSchema: {
          command: commandSchema,
          idempotencyKey: z.string().min(1).max(128),
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      async ({ command, idempotencyKey }) =>
        toolResult(() => mutate(p, command, idempotencyKey)),
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  } catch (e) {
    const response = failure(e);
    if (response.status === 401)
      response.headers.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${process.env.APP_URL}/.well-known/oauth-protected-resource"`,
      );
    return response;
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
