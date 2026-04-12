import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isAppLocale,
} from "@/i18n/locales";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale =
    requestedLocale && isAppLocale(requestedLocale)
      ? requestedLocale
      : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Shanghai",
  };
});
