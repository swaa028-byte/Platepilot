import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./config";
import { getDbClient } from "@/server/db/client";
import { readLocalSessionUserId } from "./local-session";

export async function createClient() {
  if (!isSupabaseConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(values) {
          try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Components cannot set cookies; proxy/session refresh handles this. */ }
        },
      },
    },
  );
}

/**
 * Returns the signed-in staff member and a database client.
 *
 * Supabase Auth is used when it is configured. Otherwise the local session is
 * used, which signs the user in against PlatePilot's own local database.
 */
export async function requireUser() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("AUTH_REQUIRED");
    return { supabase, user: data.user };
  }
  const userId = await readLocalSessionUserId();
  if (!userId) throw new Error("AUTH_REQUIRED");
  return { supabase: await getDbClient(), user: { id: userId } };
}
