"use client";

import { useTranslations } from "next-intl";

import { controlledErrorCopy } from "@/lib/controlled-error-copy";
import { ApiError as ApiErrorClass } from "@/services/api-client";
import { Button } from "@/components/ui/button";

type ApiErrorProps = {
  error: Error;
  reset?: () => void;
};

export function ApiError({ error, reset }: ApiErrorProps) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  const message =
    error instanceof ApiErrorClass
      ? controlledErrorCopy(t, error)
      : t("backend");

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5">
      <p className="text-sm font-medium text-destructive">{t("title")}</p>
      <p className="mt-1 text-sm text-destructive/80">{message}</p>
      {reset ? (
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="mt-3"
        >
          {common("actions.tryAgain")}
        </Button>
      ) : null}
    </div>
  );
}
