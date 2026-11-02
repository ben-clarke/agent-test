import { defineConfig } from "vitest/config";

const COVERAGE_THRESHOLD_PERCENT = 100;

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/test-support/**", "e2e/**", "*.config.ts"],
      thresholds: {
        lines: COVERAGE_THRESHOLD_PERCENT,
        functions: COVERAGE_THRESHOLD_PERCENT,
        branches: COVERAGE_THRESHOLD_PERCENT,
        statements: COVERAGE_THRESHOLD_PERCENT,
      },
    },
  },
});
