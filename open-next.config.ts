import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Cloudflare Workers configuration for the PlatePilot ordering app.
 *
 * The build output from `next build` is adapted to run on the Workers
 * runtime. No incremental cache is configured: the app's own data lives in
 * Supabase, whose REST layer is cached per request by HTTP headers rather
 * than by the worker.
 */
export default defineCloudflareConfig({});
