import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { boundedFetch } from "./fetch";
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SECRET_KEY &&
    process.env.MONEYMAP_MASTER_KEYS
  );
}
export async function supabaseServer(signal?: AbortSignal) {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { fetch: boundedFetch(signal) },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values) {
            try {
              jar.set(name, value, options);
            } catch {
              /* Server components cannot set cookies; route handlers refresh sessions. */
            }
          }
        },
      },
    },
  );
}
