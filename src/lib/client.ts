"use client";
import { createBrowserClient } from "@supabase/ssr";
let client: ReturnType<typeof createBrowserClient> | undefined;
export function supabaseBrowser() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body
      ? {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? "Request failed.");
  return value as T;
}
export function download(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
