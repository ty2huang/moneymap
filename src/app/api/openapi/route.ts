import { z } from "zod";
import {
  accountInput,
  categoryInput,
  transactionInput,
  transferInput,
} from "@/domain/contracts";
import { getAppUrl } from "@/server/app-url";
export async function GET() {
  const schemas = {
    accounts: accountInput,
    categories: categoryInput,
    transactions: transactionInput,
    transfers: transferInput,
  };
  const paths: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const requestBody = {
      required: true,
      content: { "application/json": { schema: z.toJSONSchema(schema) } },
    };
    paths[`/api/v1/${name}`] = {
      get: {
        summary: `List ${name}`,
        parameters: [
          "page",
          "pageSize",
          "from",
          "to",
          "accountId",
          "categoryId",
          "subcategoryId",
          "kind",
          "status",
        ].map((name) => ({ name, in: "query", schema: { type: "string" } })),
        responses: {
          200: {
            description:
              "Paginated records; monetary amounts are decimal strings.",
          },
        },
      },
      post: {
        summary: `Create ${name}`,
        requestBody,
        parameters: [
          { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Committed revision and replayed flag" },
        },
      },
    };
    paths[`/api/v1/${name}/{id}`] = {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      patch: {
        summary: `Edit ${name}; version required`,
        requestBody,
        responses: {
          200: { description: "Committed" },
          409: { description: "Version conflict" },
        },
      },
      delete: {
        summary: `Delete ${name}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["version"],
                properties: { version: { type: "integer" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Deleted" },
          409: { description: "Conflict" },
        },
      },
    };
  }
  paths["/api/v1/analytics"] = {
    get: {
      summary: "Snapshot of cashflow and spending",
      parameters: [
        {
          name: "from",
          in: "query",
          required: true,
          schema: { type: "string", format: "date" },
        },
        {
          name: "to",
          in: "query",
          required: true,
          schema: { type: "string", format: "date" },
        },
        ...["period", "group", "accountId"].map((name) => ({
          name,
          in: "query",
          schema: { type: "string" },
        })),
      ],
      responses: {
        200: { description: "Report with decimal string monetary values" },
      },
    },
  };
  paths["/api/v1/export"] = {
    get: {
      summary: "Export filtered transactions as CSV",
      responses: { 200: { description: "CSV download" } },
    },
  };
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "MoneyMap API",
      version: "1.0.0",
      description:
        "OAuth or personal bearer tokens. Read/write permissions are household-specific application grants. Never send minor-unit numbers as amounts.",
    },
    servers: [{ url: getAppUrl() }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    },
    paths,
  });
}
