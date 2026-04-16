import { listEnvironments } from "@/services/settings";
import type { ResourceListParams } from "@/types/resource";

const UNKNOWN_ENVIRONMENT_ID = "00000000-0000-0000-0000-000000000000";

export async function resolveEnvironmentSlugToId(
  params: ResourceListParams,
): Promise<ResourceListParams> {
  if (!params.environmentSlug || params.environmentId) {
    return params;
  }

  const environments = await listEnvironments();
  const environmentId = environments.find(
    (environment) => environment.slug === params.environmentSlug,
  )?.id;

  return {
    ...params,
    environmentId: environmentId ?? UNKNOWN_ENVIRONMENT_ID,
  };
}
