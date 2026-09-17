export function getAppUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured;

  const host = process.env.APP_HOST?.trim() || "localhost";
  const port = process.env.PORT?.trim() || "3000";
  return `http://${host}:${port}`;
}
