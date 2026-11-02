import { defineConfig } from "vitest/config";

const COVERAGE_THRESHOLD_PERCENT = 100;

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test-support/**",
        "src/vitest.setup.ts",
        "e2e/**",
        "*.config.ts",
        "src/main.tsx",
      ],
      thresholds: {
        lines: COVERAGE_THRESHOLD_PERCENT,
        functions: COVERAGE_THRESHOLD_PERCENT,
        branches: COVERAGE_THRESHOLD_PERCENT,
        statements: COVERAGE_THRESHOLD_PERCENT,
      },
    },
  },
});
