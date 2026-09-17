import { getAppUrl } from "@/server/app-url";

export async function GET() {
  const appUrl = getAppUrl();
  return Response.json(
    {
      resource: appUrl,
      authorization_servers: [
        process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1",
      ],
      bearer_methods_supported: ["header"],
      resource_documentation: appUrl + "/api/openapi",
    },
    {
      // Browser-based OAuth clients discover this public document cross-origin,
      // even when their MCP requests go through the Inspector proxy.
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  );
}
