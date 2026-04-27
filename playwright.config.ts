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
      // Node.js v22 emits a noisy warning when both NO_COLOR and FORCE_COLOR
      // are present in the environment.  Playwright internally sets FORCE_COLOR
      // for child processes; some host environments (Claude Code, CI) also set
      // NO_COLOR.  The `env: { NO_COLOR: undefined }` override removes it from
      // the child process environment so the warning is suppressed without
      // affecting color output (FORCE_COLOR still takes effect).
      command:
        "NEXT_PUBLIC_API_BASE_URL=http://localhost:8081 npm run dev -- -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: true,
      timeout: 60_000,
      name: "frontend",
      env: { ...process.env, NO_COLOR: undefined as unknown as string },
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
