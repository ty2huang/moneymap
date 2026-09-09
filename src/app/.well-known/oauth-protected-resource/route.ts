export async function GET() {
  return Response.json(
    {
      resource: process.env.APP_URL,
      authorization_servers: [process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_documentation: process.env.APP_URL + "/api/openapi",
    },
    {
      // Browser-based OAuth clients discover this public document cross-origin,
      // even when their MCP requests go through the Inspector proxy.
      headers: { "Access-Control-Allow-Origin": "*" },
    },
  );
}
