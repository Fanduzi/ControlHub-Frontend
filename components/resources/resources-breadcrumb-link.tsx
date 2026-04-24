"use client";

import { useEffect, useState } from "react";
import { BreadcrumbLink } from "@/components/ui/breadcrumb";
import { loadResourceListUrl } from "@/lib/resource-list-persistence";

export function ResourcesBreadcrumbLink({ label }: { label: string }) {
  const [href, setHref] = useState("/resources");

  useEffect(() => {
    setHref(loadResourceListUrl() ?? "/resources");
  }, []);

  return <BreadcrumbLink href={href}>{label}</BreadcrumbLink>;
}
