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
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
