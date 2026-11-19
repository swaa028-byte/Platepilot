import { createClient } from "@supabase/supabase-js";

/**
 * Node-safe database runtime.
 *
 * This module deliberately does not carry the `server-only` marker, because the
 * durable worker runs as a plain Node process rather than inside Next.js and
 * would otherwise fail on import. React code should still import the
 * `server-only` wrapper in `admin.ts`.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
