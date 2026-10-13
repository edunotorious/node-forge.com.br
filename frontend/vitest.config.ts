import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests only (pure logic: stores, helpers). Browser flows live in
// tests/e2e and run under Playwright against the full stack.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
