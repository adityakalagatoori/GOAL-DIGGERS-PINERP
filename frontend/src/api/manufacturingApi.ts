import { apiFetch, buildQuery } from './client';
import type { ManufacturingOrder } from '../types';

export function listManufacturingOrders(params?: { search?: string; status?: string; scheduleDateFrom?: string; scheduleDateTo?: string }) {
  return apiFetch<ManufacturingOrder[]>(`/api/manufacturing${buildQuery(params ?? {})}`);
}

export function getManufacturingOrder(id: number) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}`);
}

export function createManufacturingOrder(data: { finishedProductId: number; quantity: number; bomId?: number; scheduleDate?: string; assigneeId?: number }) {
  return apiFetch<ManufacturingOrder>('/api/manufacturing', { method: 'POST', body: data });
}

export function updateManufacturingOrder(id: number, data: Partial<{ quantity: number; scheduleDate: string; assigneeId: number }>) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}`, { method: 'PATCH', body: data });
}

export function deleteManufacturingOrder(id: number) {
  return apiFetch<void>(`/api/manufacturing/${id}`, { method: 'DELETE' });
}

export function confirmManufacturingOrder(id: number) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}/confirm`, { method: 'POST' });
}

export function startManufacturingOrder(id: number) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}/start`, { method: 'POST' });
}

// Note: the backend's action is named "produce" (not "complete") — this is
// one of the literal contract mismatches the gap analysis flagged.
export function produceManufacturingOrder(id: number) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}/produce`, { method: 'POST' });
}

export function cancelManufacturingOrder(id: number) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}/cancel`, { method: 'POST' });
}

export function updateComponentConsumption(id: number, components: { id: number; consumedQty: number }[]) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}/components`, { method: 'PATCH', body: { components } });
}

export function updateWorkOrderDuration(id: number, workOrders: { id: number; realDurationMins: number }[]) {
  return apiFetch<ManufacturingOrder>(`/api/manufacturing/${id}/work-orders`, { method: 'PATCH', body: { workOrders } });
}
