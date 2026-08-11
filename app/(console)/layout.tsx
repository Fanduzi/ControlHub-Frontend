// input: react, AppShell, EnvironmentProvider
// output: console route layout wrapping AppShell with EnvironmentProvider
// pos: authenticated console pages only; keeps login free of environments probe
// note: if this file changes, update header and app/(console)/README.md
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
