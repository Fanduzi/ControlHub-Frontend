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
