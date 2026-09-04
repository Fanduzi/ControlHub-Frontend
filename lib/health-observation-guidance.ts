// input: inventory health and lifecycle fields
// output: whether unknown health is missing collector observation rather than a console setting
// pos: shared empty-state predicate for Issue #71 collector health guidance
// note: if this file changes, update this header and module README.md.

export function hasMissingCollectorHealthObservation(resources: Array<{
  healthStatus: string;
  lifecycleStatus: string;
}>): boolean {
  return resources.some(
    (resource) =>
      resource.healthStatus === "unknown" &&
      resource.lifecycleStatus !== "provisioning" &&
      resource.lifecycleStatus !== "decommissioning",
  );
}
