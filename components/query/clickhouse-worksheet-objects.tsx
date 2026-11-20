"use client";

import { useTranslations } from "next-intl";
import type { ClickHouseWorksheetCatalog } from "@/lib/use-clickhouse-worksheet-catalog";

export function ClickHouseWorksheetObjects({
  catalog,
}: {
  catalog?: ClickHouseWorksheetCatalog;
}) {
  const t = useTranslations("queryWorkbench.clickHousePreview");
  if (!catalog) return <p role="status">{t("loading")}</p>;
  const ns = catalog.namespace;
  if (!ns) return <p role="alert">{t("failed")}</p>;
  if (!ns.tables.length) return <p role="status">{t("noTables")}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {ns.tables.map((table) => (
        <li key={table.name}>
          <details>
            <summary className="cursor-pointer font-medium">
              {table.name}
            </summary>
            <ul className="pl-5 font-mono">
              {ns.loadedColumns?.[table.name]?.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
