/**
 * Server startup hook.
 *
 * PlatePilot's local database is an embedded PostgreSQL that is opened once
 * per process. It is opened here, before the server accepts requests, because
 * the first open has to happen in the plain server context: opening it
 * lazily inside a Server Component render can fail with a path-resolution
 * error, because the bundler resolves that module's assets differently for
 * the two bundles.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const { getLocalClient } = await import("@/server/db/local");
    await getLocalClient();
    console.log("PlatePilot local database ready.");
  } catch (error) {
    console.error("PlatePilot local database failed to open", error instanceof Error ? error.message : error);
  }
}
