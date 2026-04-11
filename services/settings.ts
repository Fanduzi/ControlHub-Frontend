import type {
  DictionaryRecord,
  EnvironmentRecord,
  OwnerRecord,
  RoleRecord,
} from "@/types/settings";

const environments: EnvironmentRecord[] = [
  {
    id: "env-prod",
    name: "Production",
    code: "production",
    ownership_model: "Central approval required",
  },
  {
    id: "env-staging",
    name: "Staging",
    code: "staging",
    ownership_model: "Service owner managed",
  },
  {
    id: "env-dev",
    name: "Development",
    code: "development",
    ownership_model: "Team self-service",
  },
];

const owners: OwnerRecord[] = [
  {
    id: "owner-dba",
    name: "DBA Team",
    team: "Database Engineering",
    slack_channel: "#dba-team",
  },
  {
    id: "owner-platform",
    name: "Platform Ops",
    team: "Platform Engineering",
    slack_channel: "#platform-ops",
  },
  {
    id: "owner-supply",
    name: "Supply Chain Systems",
    team: "Supply Platform",
    slack_channel: "#supply-systems",
  },
];

const roles: RoleRecord[] = [
  { id: "role-admin", name: "admin", scope: "Resource and dictionary management" },
  { id: "role-editor", name: "editor", scope: "Read and update managed resources" },
];

const dictionaries: DictionaryRecord[] = [
  {
    key: "resourceType",
    description: "Top-level asset families supported in phase 1",
    values: ["host", "database_instance", "database_cluster", "service"],
  },
  {
    key: "lifecycleStatus",
    description: "Asset lifecycle classification",
    values: ["running", "pending", "retired"],
  },
  {
    key: "healthStatus",
    description: "Operator health posture signal",
    values: ["healthy", "warning", "degraded", "critical"],
  },
];

export async function listEnvironments() {
  return environments;
}

export async function listOwners() {
  return owners;
}

export async function listRoles() {
  return roles;
}

export async function listDictionaries() {
  return dictionaries;
}
