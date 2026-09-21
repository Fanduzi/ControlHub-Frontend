// input: resource list view models
// output: whether a resource belongs in the Overview attention queue
// pos: shared predicate for Overview posture pending and the attention table
// note: if this file changes, update this header and lib/README.md
import { buildDatabaseOperationalSignal } from "@/lib/database-operational-signal";
import type { ResourceListViewModel } from "@/types/view-models";

export function isActionableAttention(resource: ResourceListViewModel): boolean {
  const actionableHealth = ["critical", "warning"].includes(resource.healthStatus);
  const actionableLifecycle = resource.lifecycleStatus !== "running";
  if (actionableHealth || actionableLifecycle) return true;

  if (
    resource.resourceType === "database_cluster" ||
    resource.resourceType === "database_instance"
  ) {
    const signal = buildDatabaseOperationalSignal(resource);
    return signal.level === "needs_attention" || signal.level === "critical";
  }

  return false;
}
