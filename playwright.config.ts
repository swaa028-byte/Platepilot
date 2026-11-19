import { defineConfig, devices } from "@playwright/test";

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
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  // End-to-end checks run against a production build. The dev server preloads lazy
  // chunks that the production build only fetches on demand, so bundle-loading
  // behaviour (notably the opt-in 3D renderer) is only meaningful in production.
  webServer: {
    // CI builds first as its own release gate and then starts the built app.
    // Locally the end-to-end command builds and starts the app itself.
    command: process.env.CI ? "npm run start" : "npm run build && npm run start",
    url: "http://127.0.0.1:3000/en",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
