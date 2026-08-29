// input: next/link, next-intl/server, @testing-library/react, app not-found boundaries, locale messages
// output: Vitest render coverage for localized generic and resource-specific 404 boundaries
// pos: app-boundary tests for unmatched routes and missing resource detail routes
// note: if this file changes, update header and tests/app/README.md
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

const getTranslationsMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type MessageTree = Record<string, unknown>;

function messageAt(messages: MessageTree, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as MessageTree)[key];
  }, messages);
}

function mockTranslations(locale: "en" | "zh-CN") {
  const messages = (locale === "en" ? en : zhCN) as MessageTree;
  getTranslationsMock.mockImplementation(async (namespace?: string) => {
    return (key: string) => messageAt(messages, [namespace, key].filter(Boolean).join("."));
  });
}

describe("localized not-found boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["en", "Page not found", "/overview"],
    ["zh-CN", "页面未找到", "/overview"],
  ] as const)("renders the generic %s boundary", async (locale, title, href) => {
    mockTranslations(locale);
    const { default: NotFound } = await import("@/app/not-found");

    render(await NotFound());

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", href);
  });

  it.each([
    ["en", "Resource not found", "/resources"],
    ["zh-CN", "未找到资源", "/resources"],
  ] as const)("renders the resource-specific %s boundary", async (locale, title, href) => {
    mockTranslations(locale);
    const { default: ResourceNotFound } = await import(
      "@/app/(console)/resources/[id]/not-found"
    );

    render(await ResourceNotFound());

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText((locale === "en"
      ? "This resource doesn't exist or has been archived."
      : "此资源不存在或已归档。"))).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", href);
  });
});
