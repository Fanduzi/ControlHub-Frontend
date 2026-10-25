import { CONTROLLED_ERROR_CODES } from "@/lib/controlled-error-codes";

type ErrorsTranslator = {
  (key: string, values?: Record<string, string>): string;
  has: (key: string) => boolean;
};

const knownCodes = new Set<string>(CONTROLLED_ERROR_CODES);

export function controlledErrorCopy(
  t: ErrorsTranslator,
  error: { code?: string; status?: number },
): string {
  const code = error.code?.trim();
  if (code) {
    if (knownCodes.has(code) && t.has(`codes.${code}`)) {
      return t(`codes.${code}`);
    }
    return t("unknownCode", { code });
  }
  if (error.status === 401) {
    return t.has("codes.unauthorized") ? t("codes.unauthorized") : t("auth");
  }
  return t("unavailable");
}
