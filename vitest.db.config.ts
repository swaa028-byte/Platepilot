import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Every case loads the schema into its own embedded PostgreSQL, which is
    // memory hungry. Running the files one at a time keeps the machine from
    // running out of memory mid-suite.
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
  },
});
