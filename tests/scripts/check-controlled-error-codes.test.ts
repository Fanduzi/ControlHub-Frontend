// input: vitest, scripts/check-controlled-error-codes.mjs
// output: fixture drift fails either direction; matching sets pass; real files must match
// pos: OpenAPI ErrorResponse.error enum vs console CONTROLLED_ERROR_CODES union
// note: if this file changes, update header
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkFiles,
  compareControlledErrorCodeSets,
  extractControlledErrorCodesFromSource,
  extractErrorResponseErrorEnum,
  formatCheckResult,
  resolveOpenApiPath,
  resolveUnionPath,
} from "../../scripts/check-controlled-error-codes.mjs";

const MATCHING_CODES = ["forbidden", "unauthorized", "validation_failed"] as const;

function errorResponseYaml(codes: readonly string[], extraSchema = true): string {
  const enumLines = codes.map((code) => `            - ${code}`).join("\n");
  const otherEnum = extraSchema
    ? `    QueryKind:
      type: string
      enum:
        - sql
        - redis
`
    : "";
  return `openapi: 3.1.0
info:
  title: fixture
  version: 0.0.0
paths: {}
components:
  schemas:
${otherEnum}    ErrorResponse:
      type: object
      required: [error, message]
      properties:
        error:
          type: string
          enum:
${enumLines}
        message:
          type: string
`;
}

function unionSource(codes: readonly string[]): string {
  const items = codes.map((code) => `  "${code}",`).join("\n");
  return `export const CONTROLLED_ERROR_CODES = [
${items}
] as const;

export type ControlledErrorCode = (typeof CONTROLLED_ERROR_CODES)[number];
`;
}

describe("extractErrorResponseErrorEnum", () => {
  it("reads ErrorResponse.error enum and ignores other schema enums", () => {
    expect(extractErrorResponseErrorEnum(errorResponseYaml(MATCHING_CODES))).toEqual([
      ...MATCHING_CODES,
    ]);
  });

  it("fails when ErrorResponse.error has no enum", () => {
    const yaml = `components:
  schemas:
    ErrorResponse:
      properties:
        error:
          type: string
        message:
          type: string
`;
    expect(() => extractErrorResponseErrorEnum(yaml)).toThrow(
      /ErrorResponse\.error must declare a closed enum/,
    );
  });
});

describe("extractControlledErrorCodesFromSource", () => {
  it("reads the exported const list", () => {
    expect(extractControlledErrorCodesFromSource(unionSource(MATCHING_CODES))).toEqual([
      ...MATCHING_CODES,
    ]);
  });

  it("fails when the const list is missing", () => {
    expect(() => extractControlledErrorCodesFromSource("export type Foo = string;")).toThrow(
      /CONTROLLED_ERROR_CODES const array not found/,
    );
  });
});

describe("compareControlledErrorCodeSets", () => {
  it("fails when fixture YAML is missing a console union member", () => {
    const result = compareControlledErrorCodeSets(
      ["forbidden", "unauthorized"],
      ["forbidden", "unauthorized", "validation_failed"],
    );
    expect(result.ok).toBe(false);
    expect(result.missingFromOpenApi).toEqual(["validation_failed"]);
    expect(result.missingFromUnion).toEqual([]);
  });

  it("fails when the console union has an extra member", () => {
    const result = compareControlledErrorCodeSets(
      ["forbidden", "unauthorized"],
      ["forbidden", "unauthorized", "invented_code"],
    );
    expect(result.ok).toBe(false);
    expect(result.missingFromOpenApi).toEqual(["invented_code"]);
  });

  it("fails when OpenAPI has a member the union lacks", () => {
    const result = compareControlledErrorCodeSets(
      ["forbidden", "unauthorized", "internal_error"],
      ["forbidden", "unauthorized"],
    );
    expect(result.ok).toBe(false);
    expect(result.missingFromUnion).toEqual(["internal_error"]);
  });

  it("passes when the sets match regardless of order", () => {
    const result = compareControlledErrorCodeSets(
      ["validation_failed", "forbidden", "unauthorized"],
      ["unauthorized", "validation_failed", "forbidden"],
    );
    expect(result).toEqual({
      ok: true,
      missingFromOpenApi: [],
      missingFromUnion: [],
    });
  });
});

describe("checkFiles", () => {
  it("fails fixture YAML that is missing a union member", () => {
    const result = checkFiles({
      openApiYaml: errorResponseYaml(["forbidden", "unauthorized"]),
      unionSource: unionSource(MATCHING_CODES),
    });
    expect(result.ok).toBe(false);
    expect(result.missingFromOpenApi).toEqual(["validation_failed"]);
    expect(formatCheckResult(result)).toContain("validation_failed");
  });

  it("fails an extra console union member", () => {
    const result = checkFiles({
      openApiYaml: errorResponseYaml(["forbidden", "unauthorized"]),
      unionSource: unionSource(["forbidden", "unauthorized", "invented_code"]),
    });
    expect(result.ok).toBe(false);
    expect(result.missingFromOpenApi).toEqual(["invented_code"]);
  });

  it("passes matching fixture sets", () => {
    const result = checkFiles({
      openApiYaml: errorResponseYaml(MATCHING_CODES),
      unionSource: unionSource(MATCHING_CODES),
    });
    expect(result.ok).toBe(true);
    expect(formatCheckResult(result)).toMatch(/passed \(3 codes\)/);
  });
});

describe("resolveOpenApiPath", () => {
  it("prefers CONTROLHUB_OPENAPI_PATH over CONTROLHUB_BACKEND_DIR", () => {
    const cwd = mkdtempSync(join(tmpdir(), "controlled-error-openapi-"));
    try {
      expect(
        resolveOpenApiPath(
          {
            CONTROLHUB_OPENAPI_PATH: "custom/openapi.yaml",
            CONTROLHUB_BACKEND_DIR: "ignored-backend",
          },
          cwd,
        ),
      ).toBe(resolve(cwd, "custom/openapi.yaml"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("joins CONTROLHUB_BACKEND_DIR to internal/openapi/openapi.yaml", () => {
    const cwd = mkdtempSync(join(tmpdir(), "controlled-error-backend-"));
    try {
      expect(resolveOpenApiPath({ CONTROLHUB_BACKEND_DIR: "backend" }, cwd)).toBe(
        resolve(cwd, "backend/internal/openapi/openapi.yaml"),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("uses the CI controlhub-backend checkout when env is unset", () => {
    const cwd = mkdtempSync(join(tmpdir(), "controlled-error-ci-"));
    try {
      const nested = join(cwd, "controlhub-backend", "internal", "openapi");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, "openapi.yaml"), "openapi: 3.1.0\n");
      expect(resolveOpenApiPath({}, cwd)).toBe(join(nested, "openapi.yaml"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails closed when no OpenAPI path can be resolved", () => {
    const cwd = mkdtempSync(join(tmpdir(), "controlled-error-missing-"));
    try {
      expect(() => resolveOpenApiPath({}, cwd)).toThrow(/CONTROLHUB_BACKEND_DIR/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("real Controlled Error Code files", () => {
  it("passes when the console union matches the backend OpenAPI enum", () => {
    const openApiPath = resolveOpenApiPath(process.env, process.cwd());
    const unionPath = resolveUnionPath(process.cwd());
    const result = checkFiles({
      openApiYaml: readFileSync(openApiPath, "utf8"),
      unionSource: readFileSync(unionPath, "utf8"),
    });
    expect(result.ok, formatCheckResult(result)).toBe(true);
    expect(result.openapiCodes).toContain("query_result_disclosure_blocked");
    expect([...result.unionCodes].sort()).toEqual([...result.openapiCodes].sort());
  });
});
