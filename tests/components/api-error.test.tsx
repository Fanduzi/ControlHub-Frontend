// input: ApiError block, next-intl errors catalog, ApiError class
// output: code-mapped operator copy without English envelope message
// pos: component-level regression for Issue #69
// note: if this file changes, update header and tests/components/README.md

import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/components/blocks/api-error";
import { ApiError as ApiErrorClass } from "@/services/api-client";
import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";

describe("ApiError", () => {
  it("shows catalog copy for validation_failed and hides the English message", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhCN}>
        <ApiError
          error={
            new ApiErrorClass(
              400,
              "environmentId must be a positive integer",
              undefined,
              "validation_failed",
            )
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("校验失败。请检查请求后重试。")).toBeInTheDocument();
    expect(
      screen.queryByText("environmentId must be a positive integer"),
    ).not.toBeInTheDocument();
  });

  it("does not interpolate a raw message for unknown codes", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ApiError
          error={
            new ApiErrorClass(500, "disk is on fire", undefined, "not_a_published_code")
          }
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("A controlled failure occurred (not_a_published_code).")).toBeInTheDocument();
    expect(screen.queryByText("disk is on fire")).not.toBeInTheDocument();
  });
});
