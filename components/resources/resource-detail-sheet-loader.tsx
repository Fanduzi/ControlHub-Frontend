"use client";

import { useEffect, useState } from "react";

import { getResourceViewModel } from "@/lib/view-models";
import type {
  ResourceDetailViewModel,
  ResourceListViewModel,
} from "@/types/view-models";

import { ResourceDetailSheet } from "./resource-detail-sheet";

type ResourceDetailSheetLoaderProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceListViewModel | null;
};

export function ResourceDetailSheetLoader({
  open,
  onOpenChange,
  resource,
}: ResourceDetailSheetLoaderProps) {
  const [detailResource, setDetailResource] =
    useState<ResourceDetailViewModel | null>(null);
  const requestedResourceId = open ? resource?.id ?? null : null;
  const loading =
    requestedResourceId !== null && detailResource?.id !== requestedResourceId;

  useEffect(() => {
    let cancelled = false;

    if (!requestedResourceId) {
      return undefined;
    }

    getResourceViewModel(requestedResourceId)
      .then((nextResource) => {
        if (!cancelled) {
          setDetailResource(nextResource);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailResource(null);
        }
      })
    return () => {
      cancelled = true;
    };
  }, [requestedResourceId]);

  return (
    <ResourceDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      resource={
        detailResource?.id === requestedResourceId ? detailResource : resource
      }
      loading={loading}
    />
  );
}
