// input: resource aliases and system/value external identifiers
// output: accessible controlled editors for resource identity collections
// pos: shared identity editor used by create and edit resource sheets
// note: if this file changes, update this header and README.md
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResourceExternalIdentifier } from "@/types/resource";
import { useTranslations } from "next-intl";

type ResourceIdentityFieldsProps = {
  aliases: string[];
  externalIdentifiers: ResourceExternalIdentifier[];
  onAliasesChange: (aliases: string[]) => void;
  onExternalIdentifiersChange: (identifiers: ResourceExternalIdentifier[]) => void;
};

export function ResourceIdentityFields({
  aliases,
  externalIdentifiers,
  onAliasesChange,
  onExternalIdentifiersChange,
}: ResourceIdentityFieldsProps) {
  const t = useTranslations("common");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("fields.aliases")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => onAliasesChange([...aliases, ""])}>
            {t("identityEditor.addAlias")}
          </Button>
        </div>
        {aliases.map((alias, index) => (
          <div key={index} className="flex gap-2">
            <Input
              aria-label={t("identityEditor.alias", { number: index + 1 })}
              value={alias}
              onChange={(event) => onAliasesChange(aliases.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
            />
            <Button type="button" variant="outline" size="sm" aria-label={t("identityEditor.removeAlias", { number: index + 1 })} onClick={() => onAliasesChange(aliases.filter((_, itemIndex) => itemIndex !== index))}>
              {t("identityEditor.remove")}
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("fields.externalIdentifiers")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => onExternalIdentifiersChange([...externalIdentifiers, { system: "", value: "" }])}>
            {t("identityEditor.addExternalIdentifier")}
          </Button>
        </div>
        {externalIdentifiers.map((identifier, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              aria-label={t("identityEditor.systemAriaLabel", { number: index + 1 })}
              placeholder={t("identityEditor.system")}
              value={identifier.system}
              onChange={(event) => onExternalIdentifiersChange(externalIdentifiers.map((item, itemIndex) => itemIndex === index ? { ...item, system: event.target.value } : item))}
            />
            <Input
              aria-label={t("identityEditor.valueAriaLabel", { number: index + 1 })}
              placeholder={t("identityEditor.value")}
              value={identifier.value}
              onChange={(event) => onExternalIdentifiersChange(externalIdentifiers.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
            />
            <Button type="button" variant="outline" size="sm" aria-label={t("identityEditor.removeExternalIdentifier", { number: index + 1 })} onClick={() => onExternalIdentifiersChange(externalIdentifiers.filter((_, itemIndex) => itemIndex !== index))}>
              {t("identityEditor.remove")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
