"use client";

import { useTranslations } from "next-intl";

type ApiErrorProps = {
  error: Error;
  reset?: () => void;
};

export function ApiError({ error, reset }: ApiErrorProps) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  const message = error.message.includes("fetch")
    ? t("backend")
    : error.message.includes("401")
      ? t("auth")
      : error.message.includes("403")
        ? t("forbidden")
        : error.message.includes("404")
          ? t("notFound")
          : t("unexpected", { message: error.message });

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-5">
      <p className="text-sm font-medium text-rose-900">{t("title")}</p>
      <p className="mt-1 text-sm text-rose-700">{message}</p>
      {reset ? (
        <button
          type="button"
          onClick={reset}
          className="mt-3 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-50"
        >
          {common("actions.tryAgain")}
        </button>
      ) : null}
    </div>
  );
}
