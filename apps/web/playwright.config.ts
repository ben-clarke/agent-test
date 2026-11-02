import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3100;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const SERVER_START_TIMEOUT_MS = 60_000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: WEB_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx src/server.ts",
      cwd: "../api",
      env: { PORT: String(API_PORT), DATABASE_PATH: "../web/e2e/.data/library.sqlite" },
      url: `${API_URL}/assets`,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MS,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      env: { API_URL },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MS,
    },
  ],
});
