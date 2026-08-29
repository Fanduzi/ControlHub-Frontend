// input: next/link, next-intl/server
// output: localized resource-specific 404 boundary with a resources recovery link
// pos: resource detail segment boundary for missing or archived resources
// note: if this file changes, update header and app/(console)/README.md
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function ResourceNotFound() {
  const t = await getTranslations("notFound.resource");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          {t("description")}
        </p>
        <Link
          href="/resources"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("backToResources")}
        </Link>
      </div>
    </main>
  );
}
