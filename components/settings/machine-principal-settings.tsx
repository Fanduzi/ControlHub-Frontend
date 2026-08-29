// input: authenticated browser session and machine-principal API
// output: localized admin-only machine-principal lifecycle UI
// pos: Settings route boundary for one-time credential issuance
// note: if this file changes, update components/settings/README.md.
"use client";

import { useLocale } from "next-intl";
import { FormEvent, useEffect, useState } from "react";

import { useAdminRole } from "@/lib/auth-role";
import { getMachinePrincipalCopy } from "@/lib/machine-principal-copy";
import {
  createMachinePrincipal,
  listMachinePrincipals,
  revokeMachineCredential,
  rotateMachineCredential,
} from "@/services/machine-principals";
import {
  MACHINE_PRINCIPAL_SCOPES,
  type MachinePrincipal,
  type MachineScope,
} from "@/types/machine-principal";

const DAY_MS = 24 * 60 * 60 * 1000;

export function MachinePrincipalSettings() {
  const isAdmin = useAdminRole();
  const copy = getMachinePrincipalCopy(useLocale());
  const [items, setItems] = useState<MachinePrincipal[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<MachineScope[]>(["inventory:read"]);
  const [lifetimeDays, setLifetimeDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isAdmin !== true) return;
    let active = true;
    setLoading(true);
    listMachinePrincipals()
      .then((response) => {
        if (active) setItems(response.items);
      })
      .catch(() => {
        if (active) setError(copy.requestFailed);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [copy.requestFailed, isAdmin]);

  if (isAdmin === null) {
    return <div aria-busy="true" className="min-h-24 rounded-lg border border-border" />;
  }
  if (!isAdmin) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{copy.title}</h1>
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
          {copy.restricted}
        </p>
      </section>
    );
  }

  function expiryFor(days: number) {
    return new Date(Date.now() + days * DAY_MS).toISOString();
  }

  function toggleScope(scope: MachineScope) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = Number(lifetimeDays);
    if (!name.trim() || scopes.length === 0 || !Number.isInteger(days) || days < 1 || days > 90) {
      setError(copy.invalidForm);
      return;
    }
    setError(null);
    setOneTimeSecret(null);
    setCopied(false);
    setSubmitting(true);
    try {
      const issue = await createMachinePrincipal({
        name: name.trim(),
        scopes,
        expiresAt: expiryFor(days),
      });
      setItems((current) => [
        { ...issue.principal, credential: issue.credential },
        ...current.filter((item) => item.id !== issue.principal.id),
      ]);
      setName("");
      setOneTimeSecret(issue.secret);
    } catch {
      setError(copy.requestFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotate(item: MachinePrincipal) {
    if (!item.credential || item.credential.revokedAt || !window.confirm(copy.rotateConfirm)) return;
    setError(null);
    setOneTimeSecret(null);
    setCopied(false);
    try {
      const issue = await rotateMachineCredential(item.credential.id, {
        scopes: item.credential.scopes,
        expiresAt: expiryFor(30),
      });
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...issue.principal, credential: issue.credential }
            : currentItem,
        ),
      );
      setOneTimeSecret(issue.secret);
    } catch {
      setError(copy.requestFailed);
    }
  }

  async function handleRevoke(item: MachinePrincipal) {
    if (!item.credential || item.credential.revokedAt || !window.confirm(copy.revokeConfirm)) return;
    setError(null);
    try {
      await revokeMachineCredential(item.credential.id);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id && currentItem.credential
            ? { ...currentItem, credential: { ...currentItem.credential, revokedAt: new Date().toISOString() } }
            : currentItem,
        ),
      );
    } catch {
      setError(copy.requestFailed);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {copy.eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </header>

      {oneTimeSecret !== null && (
        <section role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <h2 className="font-semibold text-foreground">{copy.secretTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.secretWarning}</p>
          <code className="mt-3 block break-all rounded-md border border-border bg-background p-3 text-sm text-foreground">
            {oneTimeSecret}
          </code>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(oneTimeSecret).then(() => setCopied(true));
              }}
            >
              {copied ? copy.copied : copy.copySecret}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground"
              onClick={() => {
                setOneTimeSecret(null);
                setCopied(false);
              }}
            >
              {copy.dismissSecret}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="font-semibold text-foreground">{copy.formTitle}</h2>
        <form className="mt-4 space-y-4" onSubmit={handleCreate}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-foreground">
              {copy.nameLabel}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy.namePlaceholder}
                aria-label={copy.nameLabel}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-foreground">
              {copy.lifetimeLabel}
              <input
                type="number"
                min={1}
                max={90}
                value={lifetimeDays}
                onChange={(event) => setLifetimeDays(event.target.value)}
                aria-label={copy.lifetimeLabel}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 font-normal"
              />
              <span className="block text-xs font-normal text-muted-foreground">{copy.lifetimeHelp}</span>
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-foreground">{copy.scopesLabel}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {MACHINE_PRINCIPAL_SCOPES.map((scope) => (
                <label key={scope.value} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                  />
                  {scope.value}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? copy.creating : copy.create}
          </button>
        </form>
      </section>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <section className="rounded-lg border border-border bg-background p-4">
        <h2 className="font-semibold text-foreground">{copy.listTitle}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{copy.loading}</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <caption className="sr-only">{copy.listTitle}</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-2">{copy.nameLabel}</th>
                  <th scope="col" className="px-2 py-2">{copy.scopesLabel}</th>
                  <th scope="col" className="px-2 py-2">{copy.expires}</th>
                  <th scope="col" className="px-2 py-2">{copy.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const credential = item.credential;
                  const active = Boolean(credential && !credential.revokedAt);
                  return (
                    <tr key={item.id}>
                      <th scope="row" className="px-2 py-3 font-medium text-foreground">{item.name}</th>
                      <td className="px-2 py-3 text-muted-foreground">
                        {credential?.scopes.join(", ") || copy.unavailable}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {credential ? new Date(credential.expiresAt).toLocaleDateString() : "—"}
                        <span className="sr-only">{credential?.revokedAt ? copy.revoked : active ? copy.active : ""}</span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!active}
                            onClick={() => void handleRotate(item)}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {copy.rotate}
                          </button>
                          <button
                            type="button"
                            disabled={!active}
                            onClick={() => void handleRevoke(item)}
                            className="rounded-md border border-destructive/50 px-2 py-1 text-xs font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {copy.revoke}
                          </button>
                        </div>
                        {!credential && <span className="mt-1 block text-xs text-muted-foreground">{copy.noCredential}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
