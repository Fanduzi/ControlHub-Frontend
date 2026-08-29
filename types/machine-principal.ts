// input: backend dbe6203 machine-principal JSON
// output: typed machine-principal administration data and requests
// pos: Shared frontend contract for the admin machine-credential UI
// note: if this file changes, update types/README.md.
export const MACHINE_PRINCIPAL_SCOPES = [
  { value: "inventory:read", label: "Inventory read" },
  { value: "relations:read", label: "Relations read" },
  { value: "governed-select", label: "Governed select" },
  { value: "audit:read", label: "Audit read" },
  { value: "named-views:read", label: "Named views read" },
] as const;

export type MachineScope = (typeof MACHINE_PRINCIPAL_SCOPES)[number]["value"];

export type MachineCredential = {
  id: number;
  machinePrincipalId: number;
  lookupId: string;
  scopes: MachineScope[];
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  rotatedFromCredentialId: number | null;
  createdAt: string;
};

export type MachinePrincipal = {
  id: number;
  name: string;
  createdByUserId: number;
  createdAt: string;
  credential?: MachineCredential;
};

export type MachinePrincipalListResponse = {
  items: MachinePrincipal[];
};

export type MachinePrincipalCreateRequest = {
  name: string;
  scopes: MachineScope[];
  expiresAt?: string;
};

export type MachineCredentialRotateRequest = {
  scopes: MachineScope[];
  expiresAt?: string;
};

export type MachineCredentialIssue = {
  principal: MachinePrincipal;
  credential: MachineCredential;
  secret: string;
};
