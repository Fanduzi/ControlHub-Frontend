import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { EnvironmentProvider } from "@/components/providers/environment-provider";

export default function ConsoleLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <EnvironmentProvider>
      <AppShell>{children}</AppShell>
    </EnvironmentProvider>
  );
}
