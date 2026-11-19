import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/unit/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/contract/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
