#!/usr/bin/env node

// input: backend OpenAPI YAML and lib/controlled-error-codes.ts
// output: zero exit when ErrorResponse.error enum matches CONTROLLED_ERROR_CODES
// pos: frontend CI drift gate for the closed Controlled Error Code set
// note: if this file changes, update header and package.json

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OPENAPI_REL = join("internal", "openapi", "openapi.yaml");
const UNION_REL = join("lib", "controlled-error-codes.ts");

function extractMappingBlock(lines, key) {
  const keyRe = new RegExp(`^(\\s*)${key}:\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(keyRe);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "" || /^\s*#/.test(line)) {
        body.push(line);
        continue;
      }
      const nextIndent = line.match(/^(\s*)/)[1].length;
      if (nextIndent <= indent) break;
      body.push(line);
    }
    return { indent, lines: body };
  }
  return null;
}

function extractYamlStringList(lines, key) {
  const keyRe = new RegExp(`^(\\s*)${key}:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(keyRe);
    if (!match) continue;
    const rest = match[2].trim();
    if (rest.startsWith("[")) {
      const inner = rest.replace(/^\[/, "").replace(/\]\s*$/, "").trim();
      if (inner === "") return [];
      return inner.split(",").map((item) => item.trim().replace(/^["']|["']$/g, ""));
    }
    const indent = match[1].length;
    const items = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "" || /^\s*#/.test(line)) continue;
      const nextIndent = line.match(/^(\s*)/)[1].length;
      if (nextIndent <= indent) break;
      const item = line.trim();
      const dash = item.match(/^- (?:["']([^"']+)["']|([^#\s]+))\s*(?:#.*)?$/);
      if (!dash) {
        throw new Error(`OpenAPI ErrorResponse.error enum has a non-string item: ${item}`);
      }
      items.push(dash[1] || dash[2]);
    }
    return items;
  }
  return null;
}

function uniqueOrThrow(codes, label) {
  const seen = new Set();
  for (const code of codes) {
    if (seen.has(code)) {
      throw new Error(`${label} contains duplicate ${code}`);
    }
    seen.add(code);
  }
  return codes;
}

export function extractErrorResponseErrorEnum(yaml) {
  const lines = yaml.split(/\r?\n/);
  const errorResponse = extractMappingBlock(lines, "ErrorResponse");
  if (!errorResponse) {
    throw new Error("OpenAPI ErrorResponse schema not found");
  }
  const properties = extractMappingBlock(errorResponse.lines, "properties");
  if (!properties) {
    throw new Error("OpenAPI ErrorResponse.properties not found");
  }
  const error = extractMappingBlock(properties.lines, "error");
  if (!error) {
    throw new Error("OpenAPI ErrorResponse.error not found");
  }
  const codes = extractYamlStringList(error.lines, "enum");
  if (codes === null) {
    throw new Error("OpenAPI ErrorResponse.error must declare a closed enum");
  }
  if (codes.length === 0) {
    throw new Error("OpenAPI ErrorResponse.error enum is empty");
  }
  return uniqueOrThrow(codes, "OpenAPI ErrorResponse.error enum");
}

export function extractControlledErrorCodesFromSource(source) {
  const match = source.match(
    /export const CONTROLLED_ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  if (!match) {
    throw new Error("CONTROLLED_ERROR_CODES const array not found");
  }
  const codes = [...match[1].matchAll(/"([a-z][a-z0-9_]*)"/g)].map((item) => item[1]);
  if (codes.length === 0) {
    throw new Error("CONTROLLED_ERROR_CODES is empty");
  }
  return uniqueOrThrow(codes, "CONTROLLED_ERROR_CODES");
}

export function compareControlledErrorCodeSets(openapiCodes, unionCodes) {
  const openapiSet = new Set(uniqueOrThrow(openapiCodes, "OpenAPI ErrorResponse.error enum"));
  const unionSet = new Set(uniqueOrThrow(unionCodes, "CONTROLLED_ERROR_CODES"));
  const missingFromOpenApi = [...unionSet].filter((code) => !openapiSet.has(code)).sort();
  const missingFromUnion = [...openapiSet].filter((code) => !unionSet.has(code)).sort();
  return {
    ok: missingFromOpenApi.length === 0 && missingFromUnion.length === 0,
    missingFromOpenApi,
    missingFromUnion,
  };
}

export function checkFiles({ openApiYaml, unionSource }) {
  const openapiCodes = extractErrorResponseErrorEnum(openApiYaml);
  const unionCodes = extractControlledErrorCodesFromSource(unionSource);
  return {
    ...compareControlledErrorCodeSets(openapiCodes, unionCodes),
    openapiCodes,
    unionCodes,
  };
}

export function formatCheckResult(result) {
  if (result.ok) {
    return `Controlled Error Code check passed (${result.openapiCodes.length} codes).`;
  }
  const lines = ["Controlled Error Code check failed:"];
  if (result.missingFromOpenApi.length > 0) {
    lines.push(
      `- in console union, missing from OpenAPI enum: ${result.missingFromOpenApi.join(", ")}`,
    );
  }
  if (result.missingFromUnion.length > 0) {
    lines.push(
      `- in OpenAPI enum, missing from console union: ${result.missingFromUnion.join(", ")}`,
    );
  }
  return lines.join("\n");
}

/**
 * @param {{ [key: string]: string | undefined }} [env]
 * @param {string} [cwd]
 * @returns {string}
 */
export function resolveOpenApiPath(env = process.env, cwd = process.cwd()) {
  if (env.CONTROLHUB_OPENAPI_PATH) {
    return resolve(cwd, env.CONTROLHUB_OPENAPI_PATH);
  }
  if (env.CONTROLHUB_BACKEND_DIR) {
    return resolve(cwd, env.CONTROLHUB_BACKEND_DIR, OPENAPI_REL);
  }
  const ciPath = resolve(cwd, "controlhub-backend", OPENAPI_REL);
  if (existsSync(ciPath)) {
    return ciPath;
  }
  throw new Error(
    "Controlled Error Code checker: cannot find backend OpenAPI. Set CONTROLHUB_BACKEND_DIR to the backend checkout (CI uses controlhub-backend) or CONTROLHUB_OPENAPI_PATH to internal/openapi/openapi.yaml.",
  );
}

export function resolveUnionPath(cwd = process.cwd()) {
  return resolve(cwd, UNION_REL);
}

function run() {
  let openApiPath;
  try {
    openApiPath = resolveOpenApiPath();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const unionPath = resolveUnionPath();
  let openApiYaml;
  let unionSource;
  try {
    openApiYaml = readFileSync(openApiPath, "utf8");
  } catch {
    console.error(`Controlled Error Code checker: cannot read OpenAPI at ${openApiPath}`);
    process.exitCode = 1;
    return;
  }
  try {
    unionSource = readFileSync(unionPath, "utf8");
  } catch {
    console.error(`Controlled Error Code checker: cannot read console union at ${unionPath}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = checkFiles({ openApiYaml, unionSource });
    const message = formatCheckResult(result);
    if (result.ok) {
      console.log(message);
      return;
    }
    console.error(message);
    process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const invokedScriptPath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedScriptPath === fileURLToPath(import.meta.url)) {
  run();
}
