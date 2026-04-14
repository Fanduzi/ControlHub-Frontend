"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { ResourceDetailViewModel } from "@/types/view-models";

import { EditResourceSheet } from "./edit-resource-sheet";

type ResourceDetailEditButtonProps = {
  resource: ResourceDetailViewModel;
};

export function ResourceDetailEditButton({
  resource,
}: ResourceDetailEditButtonProps) {
  const t = useTranslations();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditOpen(true)}
      >
        {t("common.actions.editResource")}
      </Button>
      <EditResourceSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        resource={resource}
      />
    </>
  );
}
