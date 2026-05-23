#!/usr/bin/env node

import http from "node:http";
import process from "node:process";

const CDP_PORT = Number(process.env.CDP_PORT || "9222");
const BASE_URL =
  process.env.CONTROLHUB_FRONTEND_URL || "http://localhost:3000";

const pages = [
  { url: "/overview?environment=prod", expect: ["概览"] },
  { url: "/databases?environment=prod", expect: ["数据库"] },
  { url: "/resources/14", expect: ["资源"] },
  { url: "/resources/22", expect: ["资源"] },
  { url: "/resources?page=1&pageSize=1", expect: ["资源"] },
  { url: "/audits?page=1&pageSize=1", expect: ["审计"] },
];

const forbiddenRawEnums = ["abnormal_first", "needs_attention"];

export function hasForbiddenRawEnum(text) {
  return forbiddenRawEnums.some((value) => text.includes(value));
}

export function summarizeSmokeResult(results) {
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return "CDP release smoke passed";
  return failed
    .map((r) => `${r.url}: ${r.checks.join(", ")}`)
    .join("\n");
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}${path}`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

let messageId = 0;

function cdpSend(ws, method, params = {}) {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout: ${method}`)),
      15000,
    );
    const handler = (event) => {
      const msg = JSON.parse(event.data.toString());
      if (msg.id !== id) return;
      clearTimeout(timeout);
      ws.removeEventListener("message", handler);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluateExpression(ws, expression) {
  const result = await cdpSend(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value;
}

async function connect() {
  const targets = await getJson("/json/list");
  const page =
    targets.find((t) => t.type === "page") ?? targets[0];
  if (!page?.webSocketDebuggerUrl) {
    throw new Error(`No CDP page target found on port ${CDP_PORT}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  await cdpSend(ws, "Runtime.enable");
  await cdpSend(ws, "Page.enable");
  await cdpSend(ws, "Network.enable");
  await cdpSend(ws, "Log.enable");
  return ws;
}

async function runSmoke() {
  const ws = await connect();
  const results = [];
  const runtimeErrors = [];
  const networkErrors = [];

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(
        msg.params?.exceptionDetails?.text ?? "runtime exception",
      );
    }
    if (
      msg.method === "Log.entryAdded" &&
      msg.params?.entry?.level === "error"
    ) {
      runtimeErrors.push(msg.params.entry.text ?? "console error");
    }
    if (msg.method === "Network.responseReceived") {
      const status = msg.params?.response?.status;
      const url = msg.params?.response?.url ?? "";
      if (status >= 400) networkErrors.push(`${status} ${url}`);
    }
  });

  try {
    for (const page of pages) {
      const url = `${BASE_URL}${page.url}`;
      runtimeErrors.length = 0;
      networkErrors.length = 0;
      await cdpSend(ws, "Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 2000));
      const text =
        (await evaluateExpression(ws, "document.body.innerText")) ?? "";
      const checks = [];
      for (const expected of page.expect) {
        if (!text.includes(expected))
          checks.push(`missing text: ${expected}`);
      }
      if (hasForbiddenRawEnum(text)) checks.push("raw enum leak");
      if (runtimeErrors.length > 0)
        checks.push(`runtime errors: ${runtimeErrors.join("; ")}`);
      if (networkErrors.length > 0)
        checks.push(`network errors: ${networkErrors.join("; ")}`);
      results.push({ url: page.url, ok: checks.length === 0, checks });
    }
  } finally {
    ws.close();
  }
  return results;
}

const __filename = new URL(import.meta.url).pathname;
const isMain =
  process.argv[1] && process.argv[1] === __filename;

if (isMain) {
  runSmoke()
    .then((results) => {
      const summary = summarizeSmokeResult(results);
      console.log(summary);
      if (results.some((r) => !r.ok)) process.exit(1);
    })
    .catch((e) => {
      console.error(
        `CDP release smoke failed to connect. Start Chrome with --remote-debugging-port=${CDP_PORT} and ensure ${BASE_URL} is reachable.`,
      );
      console.error(e.message);
      process.exit(1);
    });
}
