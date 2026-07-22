import { defineConfig } from "@playwright/test";

const devServerUrl = "http://localhost:3100";

// Node.js v22 warns when both NO_COLOR and FORCE_COLOR are set.
// Playwright sets FORCE_COLOR for child processes; some host
// environments (Claude Code, CI) also set NO_COLOR.  Strip it
// from all webServer child processes so only FORCE_COLOR remains.
function cleanEnv(): { [key: string]: string } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { NO_COLOR: _, ...rest } = process.env;
  const env: { [key: string]: string } = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) env[k] = v;
  }
  return env;
}

const webServerEnv = cleanEnv();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: devServerUrl,
    headless: true,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      // Node.js v22 TransformStream race condition (node#62036) sporadically
      // emits: TypeError: controller[kState].transformAlgorithm is not a function
      // into stderr.  The wrapper script filters ONLY that exact line; all other
      // stderr (compilation errors, real warnings, etc.) passes through untouched.
      command: "bash e2e/harness/dev-server-wrapper.sh -p 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: true,
      timeout: 60_000,
      name: "frontend",
      env: webServerEnv,
    },
    {
      command: "node e2e/api-proxy.mjs",
      url: "http://localhost:8081/__health",
      reuseExistingServer: true,
      timeout: 60_000,
      name: "api-proxy",
      env: webServerEnv,
    },
  ],
});
