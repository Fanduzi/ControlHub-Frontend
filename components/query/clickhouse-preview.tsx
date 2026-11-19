"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiClient } from "@/services/api-client";
import { Button } from "@/components/ui/button";

type Table = { name: string; columns: string[]; dailyCountColumns?: string[] };
type Result = {
  columns: { name: string; copyAllowed: boolean }[];
  rows: (number | string | null)[][];
};

export function ClickHousePreview({ targetId }: { targetId: number }) {
  const t = useTranslations("queryWorkbench.clickHousePreview");
  const path = `/query-targets/${targetId}/clickhouse-preview`;
  const [generation, setGeneration] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [limit, setLimit] = useState(10);
  const [timeColumn, setTimeColumn] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const table = tables.find((item) => item.name === name);

  useEffect(() => {
    const controller = new AbortController();
    apiClient<{ generation: string; tables: Table[] }>(path, {
      signal: controller.signal,
    })
      .then(({ generation, tables }) => {
        if (controller.signal.aborted) return;
        setGeneration(generation);
        setTables(tables);
        setName(tables[0]?.name ?? "");
        setTimeColumn(tables[0]?.dailyCountColumns?.[0] ?? "");
        setColumns(tables[0]?.columns.slice(0, 8) ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      active.current?.abort();
    };
  }, [path]);

  async function preview(daily: boolean) {
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setBusy(true);
    setFailed(false);
    setResult(null);
    try {
      const data = await apiClient<Result>(path, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify(
          daily
            ? { generation, table: name, dailyCountColumn: timeColumn }
            : { generation, table: name, columns, limit },
        ),
      });
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-b p-4" aria-label={t("title")}>
      <h2 className="text-sm font-semibold">{t("title")}</h2>
      {!table && !failed && (
        <p role="status">{generation ? t("noTables") : t("loading")}</p>
      )}
      {table && (
        <>
          <fieldset
            disabled={busy}
            className="flex flex-wrap items-center gap-4 text-sm"
          >
            <label>
              {t("table")}{" "}
              <select
                value={name}
                onChange={(e) => {
                  const next = tables.find(
                    (item) => item.name === e.target.value,
                  );
                  setName(e.target.value);
                  setTimeColumn(next?.dailyCountColumns?.[0] ?? "");
                  setColumns(next?.columns.slice(0, 8) ?? []);
                  setResult(null);
                  setFailed(false);
                }}
              >
                {tables.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t("rows")}{" "}
              <input
                type="number"
                className="w-16 rounded border px-1"
                min={1}
                max={20}
                value={limit || ""}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setResult(null);
                }}
              />
            </label>
            <fieldset className="flex flex-wrap gap-3">
              <legend>{t("columns")}</legend>
              {table.columns.map((column) => (
                <label key={column}>
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    disabled={!columns.includes(column) && columns.length >= 8}
                    onChange={(e) => {
                      setColumns(
                        e.target.checked
                          ? [...columns, column]
                          : columns.filter((v) => v !== column),
                      );
                      setResult(null);
                    }}
                  />{" "}
                  {column}
                </label>
              ))}
            </fieldset>
          </fieldset>
          {busy ? (
            <Button
              variant="outline"
              onClick={() => {
                active.current?.abort();
                setBusy(false);
              }}
            >
              {t("cancel")}
            </Button>
          ) : (
            <Button
              onClick={() => preview(false)}
              disabled={
                !columns.length ||
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 20
              }
            >
              {t("run")}
            </Button>
          )}
          {!busy && table.dailyCountColumns?.length ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label>
                {t("timeColumn")}{" "}
                <select
                  value={timeColumn}
                  onChange={(e) => {
                    setTimeColumn(e.target.value);
                    setResult(null);
                    setFailed(false);
                  }}
                >
                  {table.dailyCountColumns.map((col) => (
                    <option key={col}>{col}</option>
                  ))}
                </select>
              </label>
              <Button variant="outline" onClick={() => preview(true)}>
                {t("dailyCount")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {failed && <p role="alert">{t("failed")}</p>}
      {result &&
        (result.rows.length ? (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th scope="col" key={col.name} className="px-2 text-start">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={result.columns[j].name}
                        className={`px-2 ${result.columns[j].copyAllowed ? "" : "select-none"}`}
                      >
                        {cell === null ? <i>NULL</i> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t("empty")}</p>
        ))}
    </section>
  );
}
