import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.DATABASE_URL &&
    process.env.MONEYMAP_MASTER_KEYS
  );
}
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
