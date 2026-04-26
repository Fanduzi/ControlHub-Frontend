import { expect } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

export async function checkBackendHealth(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  expect(res.ok, `Backend /health returned ${res.status}`).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
}
