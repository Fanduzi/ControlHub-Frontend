import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import {
  listDictionaries,
  listEnvironments,
  listOwners,
  listRoles,
} from "@/services/settings";

export default async function SettingsPage() {
  const [environments, owners, roles, dictionaries] = await Promise.all([
    listEnvironments(),
    listOwners(),
    listRoles(),
    listDictionaries(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Reference dictionaries and access baseline"
        description="Phase 1 settings cover environments, owners, users, roles, and supporting dictionaries for resource maintenance."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <DetailPanel title="Environments" description="Environment catalog for asset registration and filtering.">
          <div className="space-y-3">
            {environments.map((environment) => (
              <div key={environment.id} className="rounded-lg border border-border bg-background px-3 py-3">
                <p className="font-medium text-foreground">{environment.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {environment.code} · {environment.ownership_model}
                </p>
              </div>
            ))}
          </div>
        </DetailPanel>

        <DetailPanel title="Owners" description="Current owner groups attached to phase 1 resources.">
          <div className="space-y-3">
            {owners.map((owner) => (
              <div key={owner.id} className="rounded-lg border border-border bg-background px-3 py-3">
                <p className="font-medium text-foreground">{owner.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {owner.team} · {owner.slack_channel}
                </p>
              </div>
            ))}
          </div>
        </DetailPanel>

        <DetailPanel title="Roles" description="Basic phase 1 role distinction before fine-grained permissions.">
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role.id} className="rounded-lg border border-border bg-background px-3 py-3">
                <p className="font-medium text-foreground">{role.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{role.scope}</p>
              </div>
            ))}
          </div>
        </DetailPanel>
      </div>

      <DetailPanel
        title="Supporting dictionaries"
        description="Small but explicit dictionary management keeps phase 1 contracts readable."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {dictionaries.map((dictionary) => (
            <div key={dictionary.key} className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="font-medium text-foreground">{dictionary.key}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dictionary.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dictionary.values.map((value) => (
                  <span
                    key={value}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                  >
                    {value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DetailPanel>
    </div>
  );
}
