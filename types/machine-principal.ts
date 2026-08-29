// input: backend 25c7cc9 machine-principal JSON
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
};

/** Safe lifecycle metadata returned by the administrator list endpoint. */
export type MachineCredentialLifecycle = Pick<
  MachineCredential,
  "id" | "createdAt" | "expiresAt" | "lastUsedAt" | "revokedAt"
>;

export type MachinePrincipalListItem = MachinePrincipal & {
  credentials: MachineCredentialLifecycle[];
};

export type MachinePrincipalListResponse = {
  items: MachinePrincipalListItem[];
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
