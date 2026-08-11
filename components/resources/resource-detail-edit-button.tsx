// input: react, next-intl, resource view model, auth-role, edit resource sheet
// output: admin-only resource edit affordance
// pos: resource detail page mutation control
// note: if this file changes, update header and components/resources/README.md
"use client";

import { useState } from "react";
import { useAdminRole } from "@/lib/auth-role";
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
  const isAdmin = useAdminRole();

  return (
    <>
      {isAdmin === true && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
        >
          {t("common.actions.editResource")}
        </Button>
      )}
      <EditResourceSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        resource={resource}
      />
    </>
  );
}
