import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          404
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/overview"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Return to console
        </Link>
      </div>
    </main>
  );
}
