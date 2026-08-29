// input: machine-principal requests and api-client
// output: typed list/create/rotate/revoke calls for backend dbe6203
// pos: Browser service boundary for admin machine-credential lifecycle
// note: if this file changes, update services/README.md.
import { apiClient } from "@/services/api-client";
import type {
  MachineCredentialIssue,
  MachineCredentialRotateRequest,
  MachinePrincipalCreateRequest,
  MachinePrincipalListResponse,
} from "@/types/machine-principal";

function requestBody(input: MachinePrincipalCreateRequest | MachineCredentialRotateRequest) {
  const body: Record<string, unknown> = {};
  if ("name" in input) body.name = input.name;
  body.scopes = input.scopes;
  if (input.expiresAt !== undefined) body.expiresAt = input.expiresAt;
  return JSON.stringify(body);
}

export function listMachinePrincipals(): Promise<MachinePrincipalListResponse> {
  return apiClient<MachinePrincipalListResponse>("/admin/machine-principals");
}

export function createMachinePrincipal(
  input: MachinePrincipalCreateRequest,
): Promise<MachineCredentialIssue> {
  return apiClient<MachineCredentialIssue>("/admin/machine-principals", {
    method: "POST",
    body: requestBody(input),
  });
}

export function rotateMachineCredential(
  credentialId: number,
  input: MachineCredentialRotateRequest,
): Promise<MachineCredentialIssue> {
  return apiClient<MachineCredentialIssue>(
    `/admin/machine-credentials/${credentialId}/rotate`,
    { method: "POST", body: requestBody(input) },
  );
}

export function revokeMachineCredential(credentialId: number): Promise<void> {
  return apiClient<void>(`/admin/machine-credentials/${credentialId}/revoke`, {
    method: "POST",
  });
}
