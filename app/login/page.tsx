"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login } from "@/services/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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
      router.push("/overview");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Unknown error";

      if (
        message.includes("fetch") ||
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        setError(
          "Unable to reach the backend server. Check that the API is running and NEXT_PUBLIC_API_BASE_URL is correct.",
        );
      } else if (message.includes("401")) {
        setError("Invalid email or password.");
      } else {
        setError(message);
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-border bg-card px-6 py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
            ControlHub
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground">
            Unified resource visibility for platform operations.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Phase 1 focuses on manual registration, owner alignment, environment
            context, and baseline auditability across hosts, services, clusters,
            and database instances.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Shell
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                Shared navigation, search, and environment controls
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Resource model
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                One asset backbone with typed profiles and relations
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Audit baseline
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                Manual changes captured before workflow automation
              </p>
            </div>
          </div>
        </section>

        <Card className="border-border shadow-none">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <p className="text-sm text-muted-foreground">
              Connect to the ControlHub backend to manage resources and audits.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="email"
                >
                  Email
                </label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email ? (
                  <p className="text-sm text-rose-700">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="password"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p className="text-sm text-rose-700">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              {error ? <p className="text-sm text-rose-700">{error}</p> : null}

              <Button
                className="w-full"
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                Enter console
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
