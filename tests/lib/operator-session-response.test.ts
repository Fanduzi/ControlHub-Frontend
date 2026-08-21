// input: vitest, @/lib/operator-session/response
// output: Vitest tests that BFF-synthesized JSON errors carry a snake_case Controlled Error Code
// pos: unit-level contract tests for the shared Console BFF JSON helper
// note: if this file changes, update header and tests/lib/README.md
import { describe, expect, it } from "vitest";

import { bffJson } from "@/lib/operator-session/response";

describe("bffJson", () => {
  it.each([
    [401, "unauthorized", "unauthorized"],
    [403, "forbidden", "forbidden"],
    [503, "service-unavailable", "service_unavailable"],
    [404, "not-found", "not_found"],
    [400, "forbidden-header", "forbidden_header"],
    [400, "invalid-request", "invalid_request"],
    [413, "payload-too-large", "payload_too_large"],
  ] as const)(
    "publishes %s %s as Controlled Error Code %s",
    async (status, token, error) => {
      const response = bffJson(status, token);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error, message: token });
    },
  );
});
