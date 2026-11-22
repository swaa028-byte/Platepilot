import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // One worker at a time: the desktop (Chromium) and mobile (WebKit) projects share one
  // server, and running both engines concurrently makes WebKit drop its browser context.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Where the Playwright browsers are not installed (a constrained machine),
    // PLAYWRIGHT_CHROME=1 runs the desktop project against the system Chrome.
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(process.env.PLAYWRIGHT_CHROME ? { channel: "chrome" } : {}) } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  // End-to-end checks run against a production build. The dev server preloads lazy
  // chunks that the production build only fetches on demand, so bundle-loading
  // behaviour (notably the opt-in 3D renderer) is only meaningful in production.
  webServer: {
    // CI builds first as its own release gate and then starts the built app.
    // Locally the end-to-end command builds and starts the app itself.
    //
    // The run gets its own database directory, cleared before the server
    // starts, so the checks always see a fresh install and never a workspace
    // an earlier run left behind.
    command: process.env.CI
      ? "npm run e2e:clean && npm run start"
      : "npm run build && npm run e2e:clean && npm run start",
    url: "http://127.0.0.1:3000/en",
    env: {
      LOCAL_DB_DIR: path.resolve(__dirname, ".data/e2e"),
      // The checks exercise local-mode auth and the embedded database, so the
      // developer's Supabase variables must not leak into this run — they
      // would silently switch the server to hosted mode and fail every
      // sign-in with a 404.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_ACCESS_TOKEN: "",
      DATABASE_URL: "",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
