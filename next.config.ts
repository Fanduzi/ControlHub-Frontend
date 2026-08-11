// input: next, next-intl plugin, path
// output: Next.js config without open /__api backend rewrite
// pos: app build/runtime configuration; BFF owns browser API access
// note: if this file changes, update header and README.md
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = path.resolve(__dirname);
const turbopackRoot =
  path.basename(path.dirname(projectRoot)) === ".worktrees"
    ? path.resolve(projectRoot, "../..")
    : projectRoot;

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  // No open /__api rewrite: browser traffic uses same-origin /api/proxy (BFF).
  // Server-side code calls CONTROLHUB_API_BASE_URL directly.
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
