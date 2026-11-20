import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api-client";
import type { SchemaNamespace } from "@/lib/query-sql-completion";

type Table = { name: string; columns: string[]; worksheet?: boolean };
type Identity = { targetId: number; generation: string };
export type ClickHouseWorksheetCatalog = {
  identity: Identity;
  namespace?: SchemaNamespace;
};

/** The editor and both object panes consume one authorized catalog per active identity. */
export function useClickHouseWorksheetCatalog(
  targetId?: number,
  generation?: string,
) {
  const identity = useMemo(
    () => (targetId && generation ? { targetId, generation } : undefined),
    [targetId, generation],
  );
  const [loaded, setLoaded] = useState<ClickHouseWorksheetCatalog>();
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    apiClient<{ generation: string; tables: Table[] }>(
      `/query-targets/${identity.targetId}/clickhouse-preview`,
      { signal: controller.signal },
    )
      .then((catalog) => {
        if (controller.signal.aborted) return;
        if (catalog.generation !== identity.generation) {
          setLoaded({ identity });
          return;
        }
        const allowed = catalog.tables.filter(
          (table) => table.worksheet === true,
        );
        setLoaded({
          identity,
          namespace: {
            tables: allowed.map(({ name }) => ({ name, kind: "table" })),
            loadedColumns: Object.fromEntries(
              allowed.map(({ name, columns }) => [name, columns]),
            ),
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ identity });
      });
    return () => controller.abort();
  }, [identity]);
  // Effects clean up after render. Never render the previous target's snapshot in the meantime.
  return identity && loaded?.identity === identity ? loaded : undefined;
}
