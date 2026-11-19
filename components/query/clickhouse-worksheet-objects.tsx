"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiClient } from "@/services/api-client";

type Catalog = {
  generation: string;
  tables: { name: string; columns: string[]; worksheet?: boolean }[];
};

/** Only worksheet-approved tables belong in the editor's object browser. */
export function ClickHouseWorksheetObjects({
  targetId,
  generation,
}: {
  targetId: number;
  generation: string;
}) {
  const t = useTranslations("queryWorkbench.clickHousePreview");
  const [tables, setTables] = useState<Catalog["tables"] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiClient<Catalog>(`/query-targets/${targetId}/clickhouse-preview`, {
      signal: controller.signal,
    })
      .then((catalog) => {
        if (controller.signal.aborted) return;
        if (catalog.generation !== generation) {
          setFailed(true);
          return;
        }
        setTables(catalog.tables.filter((table) => table.worksheet));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [targetId, generation]);
  if (failed) return <p role="alert">{t("failed")}</p>;
  if (!tables?.length)
    return <p role="status">{tables ? t("noTables") : t("loading")}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {tables.map((table) => (
        <li key={table.name}>
          <details>
            <summary className="cursor-pointer font-medium">
              {table.name}
            </summary>
            <ul className="pl-5 font-mono">
              {table.columns.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
