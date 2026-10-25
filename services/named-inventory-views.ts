import { apiClient } from "@/services/api-client";
import type {
  CreateNamedInventoryViewInput,
  NamedInventoryView,
  NamedInventoryViewListResponse,
  UpdateNamedInventoryViewInput,
} from "@/types/named-inventory-view";

export async function listNamedInventoryViews(): Promise<NamedInventoryViewListResponse> {
  return apiClient<NamedInventoryViewListResponse>("/inventory/views");
}

export async function createNamedInventoryView(
  input: CreateNamedInventoryViewInput,
): Promise<NamedInventoryView> {
  return apiClient<NamedInventoryView>("/inventory/views", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateNamedInventoryView(
  id: number,
  input: UpdateNamedInventoryViewInput,
): Promise<void> {
  await apiClient<void>(`/inventory/views/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteNamedInventoryView(id: number): Promise<void> {
  await apiClient<void>(`/inventory/views/${id}`, { method: "DELETE" });
}
