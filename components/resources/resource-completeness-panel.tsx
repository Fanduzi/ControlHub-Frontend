// input: server-derived resource completeness and translations
// output: read-only resource completeness panel
// pos: shared list/detail completeness readout
// note: keep this presentation-only; the server owns completeness derivation.
import { useTranslations } from "next-intl";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { formatLabel } from "@/lib/format";
import type { ResourceCompleteness } from "@/types/resource";

type ResourceCompletenessPanelProps = {
  completeness: ResourceCompleteness;
};

export function ResourceCompletenessPanel({
  completeness,
}: ResourceCompletenessPanelProps) {
  const t = useTranslations();

  return (
    <DetailPanel
      title={t("common.fields.completeness")}
      description={t("detailSheet.completenessDescription")}
    >
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t("common.completeness.scoreLabel")}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {t("common.completeness.score", { score: completeness.score })}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t("common.fields.status")}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {t(`common.completeness.status.${completeness.status}`)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t("common.completeness.missingRequirements")}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {completeness.missingRequirements.length
              ? completeness.missingRequirements.map((requirement) =>
                t.has(`common.completeness.requirements.${requirement}`)
                  ? t(`common.completeness.requirements.${requirement}`)
                  : formatLabel(requirement),
              ).join(", ")
              : t("common.notSet")}
          </dd>
        </div>
      </dl>
    </DetailPanel>
  );
}
