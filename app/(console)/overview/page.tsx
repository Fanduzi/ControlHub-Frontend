// input: Next search params/cookies, environment resolver, overview view models
// output: environment-consistent overview where explicit all overrides persisted scope
// pos: authenticated console overview route
// note: if this file changes, update this header and app/(console)/README.md
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { OverviewContent } from "@/components/overview/overview-content";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { listOverviewResourceViewModels } from "@/lib/view-models";
import { ENVIRONMENT_STORAGE_KEY, parseEnvironmentId } from "@/lib/preferences";

export default async function OverviewPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const t = await getTranslations("pages.overview");
  const rawEnvironment = (await searchParams).environment;
  const environmentSlug = (Array.isArray(rawEnvironment) ? rawEnvironment[0] : rawEnvironment)?.trim() || undefined;
  const persistedEnvironmentId = parseEnvironmentId(
    (await cookies()).get(ENVIRONMENT_STORAGE_KEY)?.value,
  );
  const resolvedScope = environmentSlug
    ? await resolveEnvironmentSlugToId({ environmentSlug })
    : persistedEnvironmentId === null ? {} : { environmentId: persistedEnvironmentId };
  const { attentionResources, resources } = resolvedScope === null
    ? { attentionResources: [], resources: [] }
    : await listOverviewResourceViewModels(resolvedScope);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <OverviewContent
        resources={resources}
        attentionResources={attentionResources}
      />
    </div>
  );
}
