import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";

import { AppProviders } from "@/components/providers/app-providers";
import type { AppLocale } from "@/i18n/locales";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ControlHub",
  description:
    "Unified resource control console for platform engineering teams",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = (await getLocale()) as AppLocale;
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppProviders locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
