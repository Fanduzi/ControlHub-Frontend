// input: environment list service, resource list params
// output: environment-scoped list params with known slugs resolved, explicit all unscoped, or null when unknown
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
  if (params.environmentSlug === "all") {
    const unscoped = { ...params };
    delete unscoped.environmentSlug;
    delete unscoped.environmentId;
    return unscoped;
  }

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
