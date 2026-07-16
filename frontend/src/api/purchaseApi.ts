import { apiFetch, buildQuery } from './client';
import type { PurchaseOrder } from '../types';

export function listPurchaseOrders(params?: { search?: string; status?: string; dueDateFrom?: string; dueDateTo?: string }) {
  return apiFetch<PurchaseOrder[]>(`/api/purchase${buildQuery(params ?? {})}`);
}

export function getPurchaseOrder(id: number) {
  return apiFetch<PurchaseOrder>(`/api/purchase/${id}`);
}

export function createPurchaseOrder(data: {
  vendorId: number;
  vendorAddress?: string;
  responsiblePersonId?: number;
  dueDate?: string;
  lines: { productId: number; orderedQty: number; costUnitPrice?: number }[];
}) {
  return apiFetch<PurchaseOrder>('/api/purchase', { method: 'POST', body: data });
}

export function updatePurchaseOrder(id: number, data: Partial<{ vendorId: number; vendorAddress: string; responsiblePersonId: number; dueDate: string; lines: { productId: number; orderedQty: number; costUnitPrice?: number }[] }>) {
  return apiFetch<PurchaseOrder>(`/api/purchase/${id}`, { method: 'PATCH', body: data });
}

export function deletePurchaseOrder(id: number) {
  return apiFetch<void>(`/api/purchase/${id}`, { method: 'DELETE' });
}

export function confirmPurchaseOrder(id: number) {
  return apiFetch<PurchaseOrder>(`/api/purchase/${id}/confirm`, { method: 'POST' });
}

export function receivePurchaseOrder(id: number, lines: { lineId: number; receivedQty: number }[]) {
  return apiFetch<PurchaseOrder>(`/api/purchase/${id}/receive`, { method: 'POST', body: { lines } });
}

export function cancelPurchaseOrder(id: number) {
  return apiFetch<PurchaseOrder>(`/api/purchase/${id}/cancel`, { method: 'POST' });
}
