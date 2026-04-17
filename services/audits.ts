import { apiClient } from "@/services/api-client";
import type {
  AuditEvent,
  AuditEventListParams,
  AuditEventListResponse,
} from "@/types/audit";

function appendRepeated(
  searchParams: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    searchParams.append(key, v);
  }
}

function buildAuditListPath(params: AuditEventListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.targetResourceId) {
    searchParams.set("targetResourceId", params.targetResourceId);
  }
  appendRepeated(searchParams, "eventType", params.eventType);
  appendRepeated(searchParams, "result", params.result);

  const query = searchParams.toString();
  return query ? `/audit-events?${query}` : "/audit-events";
}

export async function listAuditEvents(
  params: AuditEventListParams = {},
): Promise<AuditEventListResponse> {
  return apiClient<AuditEventListResponse>(buildAuditListPath(params));
}

async function listAllAuditEvents(params: AuditEventListParams = {}): Promise<AuditEvent[]> {
  const firstPage = await listAuditEvents(params);
  const allItems = [...firstPage.items];

  for (let page = 2; page <= firstPage.pageInfo.totalPages; page += 1) {
    const response = await listAuditEvents({
      ...params,
      page,
      pageSize: firstPage.pageInfo.pageSize,
    });

    allItems.push(...response.items);
  }

  return allItems;
}

export async function listResourceAuditEvents(
  resourceId: string,
): Promise<AuditEvent[]> {
  const response = await apiClient<AuditEventListResponse>(
    `/resources/${encodeURIComponent(resourceId)}/audit-events`,
  );

  return [...response.items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listRecentAuditEvents(limit = 5): Promise<AuditEvent[]> {
  const items = await listAllAuditEvents();

  return [...items]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}
