// input: environment list service, resource list params
// output: resource list params scoped by a known environment slug, or null when unknown
// pos: shared environment URL-scope resolver for inventory list pages
// note: if this file changes, update header and lib/README.md
import { listEnvironments } from "@/services/settings";
import type { ResourceListParams } from "@/types/resource";

export async function resolveEnvironmentSlugToId(
  params: ResourceListParams,
): Promise<ResourceListParams | null> {
  if (!params.environmentSlug || params.environmentId) {
    return params;
  }

  const environments = await listEnvironments();
  const environment = environments.find(
    (environment) => environment.slug === params.environmentSlug,
  );

  if (!environment) {
    return null;
  }

  return {
    ...params,
    environmentId: environment.id,
  };
}
