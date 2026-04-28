import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = path.resolve(__dirname);
const turbopackRoot =
  path.basename(path.dirname(projectRoot)) === ".worktrees"
    ? path.resolve(projectRoot, "../..")
    : projectRoot;

const apiProxyTarget =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.CONTROLHUB_API_BASE_URL ??
  "http://localhost:8080";

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  async rewrites() {
    return [
      {
        source: "/__api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
