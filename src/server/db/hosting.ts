/**
 * Where this build is running.
 *
 * PlatePilot ships two database modes: a hosted project (Supabase) and an
 * embedded PostgreSQL that writes to a directory. The embedded mode is what
 * makes the product usable without any account, and it is the only mode that
 * cannot survive a serverless host — a function gets a fresh, read-only-ish
 * filesystem each time it starts, so anything written there is lost on the next
 * request.
 *
 * Knowing the host lets the product say that out loud instead of quietly
 * accepting orders into a database that evaporates.
 */
export function isServerlessHost(env: NodeJS.ProcessEnv = process.env) {
  return env.NETLIFY === "true" || env.VERCEL === "1" || Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
}

/** True when the embedded database may be used on this host. */
export function embeddedDatabaseAllowed(env: NodeJS.ProcessEnv = process.env) {
  return !isServerlessHost(env);
}
