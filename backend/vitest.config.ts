import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Scanner tests start small local HTTP servers; keep them isolated per file.
    pool: "forks",
    testTimeout: 20_000,
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "reports/junit.xml" },
    coverage: {
      provider: "v8",
      include: ["src/scanner/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**"],
      reporter: ["text-summary", "cobertura", "html"],
      reportsDirectory: "coverage",
      // Guard against coverage silently dropping (current: ~61% lines, ~62% branches).
      thresholds: { lines: 55, branches: 55, functions: 45, statements: 55 },
    },
  },
});
