/**
 * The public base URL of this deployment.
 *
 * `APP_URL` is typed by hand into a hosting dashboard, where
 * "platepilot.example.com" without a scheme is the natural thing to write -
 * and `new URL("platepilot.example.com")` throws `ERR_INVALID_URL`, which
 * takes the whole build down when a page prerenders its metadata. The scheme
 * is therefore restored here rather than trusting the spelling, and a value
 * that is unset or empty (local mode deliberately runs with empty env
 * strings) falls back to the dev server.
 *
 * Kept in its own module, free of imports, so both middleware and route
 * handlers can use it without pulling in anything heavier.
 */
export function appBaseUrl(): string {
  const configured = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!configured) return "http://localhost:3000";
  return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
}
