const resourceSummaryKeys: Record<string, string> = {
  "40000000-0000-0000-0000-000000000001": "orderMysqlClusterProd",
  "40000000-0000-0000-0000-000000000002": "orderMysqlPrimaryProd",
  "40000000-0000-0000-0000-000000000003": "orderApiProd",
  "40000000-0000-0000-0000-000000000004": "prodDbHost01",
};

export function getResourceSummaryKey(resourceId: string) {
  return resourceSummaryKeys[resourceId] ?? null;
}
