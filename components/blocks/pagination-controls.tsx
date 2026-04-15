"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PageInfo } from "@/types/resource";

type PaginationControlsProps = {
  pageInfo: PageInfo;
};

const DEFAULT_PAGE_SIZE_OPTIONS = [15, 50, 100] as const;

function buildPageWindow(page: number, totalPages: number) {
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages, start + 2);
  const normalizedStart = Math.max(1, end - 2);

  return Array.from(
    { length: end - normalizedStart + 1 },
    (_, index) => normalizedStart + index,
  );
}

export function PaginationControls({ pageInfo }: PaginationControlsProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pages = useMemo(
    () => buildPageWindow(pageInfo.page, pageInfo.totalPages),
    [pageInfo.page, pageInfo.totalPages],
  );
  const pageSizeOptions = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_PAGE_SIZE_OPTIONS, pageInfo.pageSize]),
      ).sort((left, right) => left - right),
    [pageInfo.pageSize],
  );

  function navigate(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function updatePageSize(nextPageSize: string | null) {
    if (!nextPageSize) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("pageSize", nextPageSize);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label={t("pagination.previous")}
        disabled={pageInfo.page <= 1}
        onClick={() => navigate(pageInfo.page - 1)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("pagination.previousShort")}
      </Button>
      {pages.map((page) => {
        const active = page === pageInfo.page;

        return (
          <Button
            key={page}
            aria-current={active ? "page" : undefined}
            aria-label={t("pagination.page", { page })}
            onClick={() => navigate(page)}
            size="sm"
            type="button"
            variant={active ? "default" : "outline"}
          >
            {page}
          </Button>
        );
      })}
      <Button
        aria-label={t("pagination.next")}
        disabled={pageInfo.page >= pageInfo.totalPages}
        onClick={() => navigate(pageInfo.page + 1)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("pagination.nextShort")}
      </Button>
      <Select
        value={String(pageInfo.pageSize)}
        onValueChange={updatePageSize}
      >
        <SelectTrigger
          aria-label={t("pagination.pageSize")}
          className="h-7 w-[120px] border-border bg-background"
          size="sm"
        >
          <SelectValue placeholder={t("pagination.pageSize")} />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((pageSize) => (
            <SelectItem key={pageSize} value={String(pageSize)}>
              {t("pagination.pageSizeOption", { pageSize })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
