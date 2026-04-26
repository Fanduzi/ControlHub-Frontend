"use client";

import { BreadcrumbLink } from "@/components/ui/breadcrumb";
import { loadResourceListUrl } from "@/lib/resource-list-persistence";

export function ResourcesBreadcrumbLink({ label }: { label: string }) {
  const href = loadResourceListUrl() ?? "/resources";

  return <BreadcrumbLink href={href}>{label}</BreadcrumbLink>;
}
