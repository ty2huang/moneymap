/** Normalize OAuth return paths before using the URL parser for a redirect. */
export function safeReturnPath(value: string | null, origin: string): string {
  try {
    const base = new URL(origin);
    const result = new URL(value ?? "/", base);
    return result.origin === base.origin
      ? result.pathname + result.search + result.hash
      : "/";
  } catch {
    return "/";
  }
}
