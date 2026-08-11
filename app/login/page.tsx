// input: react, next/navigation, next-intl, services/auth
// output: legacy interactive login page setting token/role sessionStorage and cookies
// pos: public login UI; BFF login is app/api/operator-session
// note: if this file changes, update header and app/login/README.md
"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/services/api-client";
import { Input } from "@/components/ui/input";
import { login } from "@/services/auth";

type LoginValues = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = document.cookie.includes("controlhub.token=");
    if (token) {
      router.replace("/overview");
    }
  }, [router]);
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, t("form.passwordRequired")),
  });
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginValues) {
    setError(null);

    try {
      const result = await login(values);
      window.sessionStorage.setItem("controlhub.token", result.token);
      window.sessionStorage.setItem("controlhub.role", result.role);
      // eslint-disable-next-line react-hooks/immutability -- cookie set in event handler, not during render
      document.cookie = `controlhub.token=${result.token}; path=/; max-age=86400; SameSite=Strict`;
      // Role is no longer embedded in the bearer token (backend 38X-1A+). Persist
      // it beside the legacy token cookie so direct-URL / new-tab recovery can
      // restore the presentation-only admin gate without decoding the token.
      // eslint-disable-next-line react-hooks/immutability -- cookie set in event handler, not during render
      document.cookie = `controlhub.role=${result.role}; path=/; max-age=86400; SameSite=Strict`;
      router.push("/overview");
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        if (submitError.status === 401) {
          setError(t("errors.invalidCredentials"));
        } else {
          setError(submitError.message || t("errors.backend"));
        }
      } else if (submitError instanceof TypeError) {
        setError(t("errors.backend"));
      } else {
        setError(
          submitError instanceof Error
            ? submitError.message
            : t("errors.unknown"),
        );
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-border bg-card px-6 py-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {t("description")}
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {t("cards.shell.label")}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {t("cards.shell.description")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {t("cards.resourceModel.label")}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {t("cards.resourceModel.description")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                {t("cards.auditBaseline.label")}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {t("cards.auditBaseline.description")}
              </p>
            </div>
          </div>
        </section>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle>{t("form.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("form.description")}
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="email"
                >
                  {t("form.email")}
                </label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="password"
                >
                  {t("form.password")}
                </label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button
                className="w-full"
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {t("form.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
