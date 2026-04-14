import { defineConfig } from "@playwright/test";

const devServerUrl = "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: devServerUrl,
    headless: true,
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "NEXT_PUBLIC_API_BASE_URL=http://localhost:8081 npm run dev -- -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: true,
      timeout: 60_000,
      name: "frontend",
    },
    {
      command: "node e2e/api-proxy.mjs",
      url: "http://localhost:8081/__health",
      reuseExistingServer: true,
      timeout: 60_000,
      name: "api-proxy",
    },
  ],
});
