// input: @/services/api-client, @/lib/pagination, @/types/audit
// output: audit list/read services with q/environment forwarding; resource audit reads degrade to empty on the operator-boundary 403
// pos: audit data services with server-authoritative access-boundary handling
// note: if this file changes, update header and services/README.md
import { apiClient, ApiError } from "@/services/api-client";
import { appendRepeated } from "@/lib/pagination";
import type {
  AuditEvent,
  AuditEventListParams,
  AuditEventListResponse,
} from "@/types/audit";

function buildAuditListPath(params: AuditEventListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.targetResourceId !== undefined) {
    searchParams.set("targetResourceId", String(params.targetResourceId));
  }
  if (params.environmentId !== undefined) {
    searchParams.set("environmentId", String(params.environmentId));
  }
  if (params.q) {
    searchParams.set("q", params.q);
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
  resourceId: number,
): Promise<AuditEvent[]> {
  let response: AuditEventListResponse;
  try {
    response = await apiClient<AuditEventListResponse>(
      `/resources/${resourceId}/audit-events`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      // Operator access boundary: only administrators may read audit
      // events. Editors still read the resource itself; the audit panel
      // degrades to an empty timeline. The server stays authoritative.
      return [];
    }
    throw error;
  }

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
