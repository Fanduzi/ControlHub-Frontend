// input: environment list service, resource list params
// output: environment-scoped list params with a known slug resolved to its numeric ID, or null when unknown
// pos: shared environment URL-scope resolver for console list pages
// note: if this file changes, update header and lib/README.md
import { listEnvironments } from "@/services/settings";
type EnvironmentScopedParams = {
  environmentSlug?: string;
  environmentId?: number | number[];
};

export async function resolveEnvironmentSlugToId<T extends EnvironmentScopedParams>(
  params: T,
): Promise<T | null> {
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
  } as T;
}
