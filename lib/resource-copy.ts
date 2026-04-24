const resourceSummaryKeys: Record<number, string> = {
  1: "orderMysqlClusterProd",
  2: "orderMysqlPrimaryProd",
  3: "orderApiProd",
  4: "prodDbHost01",
};

export function getResourceSummaryKey(resourceId: number) {
  return resourceSummaryKeys[resourceId] ?? null;
}
