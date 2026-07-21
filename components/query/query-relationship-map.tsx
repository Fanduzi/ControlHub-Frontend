"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { getRelationshipMap } from "@/services/query-schema";
import type {
  RelationshipMapEdge,
  RelationshipMapNode,
  RelationshipMapResponse,
} from "@/types/query-schema";

type QueryRelationshipMapProps = {
  readonly targetId: number;
  readonly database: string;
  readonly name: string;
  readonly onBack: () => void;
};

type RelationshipMapState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly response: RelationshipMapResponse }
  | { readonly status: "error"; readonly code: number };

function mapRelationshipError(status: number, t: (key: string) => string): string {
  switch (status) {
    case 403:
      return t("schema.definitionErrorAccessDenied");
    case 404:
      return t("schema.definitionErrorNotFound");
    case 408:
      return t("schema.definitionErrorTimeout");
    default:
      return t("schema.relationshipError");
  }
}

function EdgeItem({
  edge,
  nodeLookup,
  t,
}: {
  readonly edge: RelationshipMapEdge;
  readonly nodeLookup: ReadonlyMap<string, RelationshipMapNode>;
  readonly t: (key: string) => string;
}) {
  const relatedNode = nodeLookup.get(
    edge.direction === "inbound" ? edge.sourceId : edge.targetId,
  );
  const relatedName = relatedNode
    ? `${relatedNode.database}.${relatedNode.name}`
    : "—";

  return (
    <li className="flex items-start gap-2 rounded border border-border/50 px-2 py-1.5 text-xs">
      <span
        className={
          edge.direction === "inbound"
            ? "shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
            : "shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
        }
      >
        {edge.direction === "inbound" ? t("schema.inbound") : t("schema.outbound")}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {relatedName}
      </span>
      <span className="shrink-0 text-muted-foreground">
        ({edge.columns.join(", ")})
      </span>
    </li>
  );
}

function RelationshipMapContent({
  response,
  t,
}: {
  readonly response: RelationshipMapResponse;
  readonly t: (key: string) => string;
}) {
  const nodeLookup = useMemo(() => {
    const lookup = new Map<string, RelationshipMapNode>();
    lookup.set(response.root.id, response.root);
    for (const node of response.nodes) {
      lookup.set(node.id, node);
    }
    return lookup;
  }, [response]);

  const inbound = response.edges.filter((e) => e.direction === "inbound");
  const outbound = response.edges.filter((e) => e.direction === "outbound");

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">
        {response.root.database}.{response.root.name}
      </p>

      {response.edges.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("schema.relationshipEmpty")}</p>
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
          <section aria-label={t("schema.inbound")}>
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("schema.inbound")}
            </h4>
            {inbound.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1">
                {inbound.map((edge) => (
                  <EdgeItem
                    key={edge.id}
                    edge={edge}
                    nodeLookup={nodeLookup}
                    t={t}
                  />
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-center" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/40">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <section aria-label={t("schema.outbound")}>
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("schema.outbound")}
            </h4>
            {outbound.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1">
                {outbound.map((edge) => (
                  <EdgeItem
                    key={edge.id}
                    edge={edge}
                    nodeLookup={nodeLookup}
                    t={t}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {response.truncated && (
        <p
          data-testid="relationship-truncated"
          className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        >
          {t("schema.relationshipTruncated")}
        </p>
      )}
    </div>
  );
}

export function QueryRelationshipMap({
  targetId,
  database,
  name,
  onBack,
}: QueryRelationshipMapProps) {
  const t = useTranslations("queryWorkbench");
  const [state, setState] = useState<RelationshipMapState>({ status: "idle" });
  const [retryNonce, setRetryNonce] = useState(0);
  const generation = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const gen = generation.current + 1;
    generation.current = gen;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    startTransition(() => {
      setState({ status: "loading" });
    });

    void getRelationshipMap(targetId, {
      database,
      name,
      signal: controller.signal,
    }).then(
      (response) => {
        if (!controller.signal.aborted && gen === generation.current) {
          startTransition(() => {
            setState({ status: "ready", response });
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted && gen === generation.current) {
          const code =
            error instanceof Error && "status" in error
              ? (error as { status: number }).status
              : 502;
          startTransition(() => {
            setState({ status: "error", code });
          });
        }
      },
    );

    return () => {
      controller.abort();
    };
  }, [targetId, database, name, retryNonce]);

  return (
    <div className="space-y-4 py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2"
      >
        ← {t("schema.relationshipBack")}
      </Button>

      {state.status === "loading" && (
        <p className="text-xs text-muted-foreground">{t("schema.loading")}</p>
      )}

      {state.status === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">
            {mapRelationshipError(state.code, t)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetryNonce((n) => n + 1)}
          >
            {t("schema.relationshipRetry")}
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <RelationshipMapContent response={state.response} t={t} />
      )}
    </div>
  );
}
