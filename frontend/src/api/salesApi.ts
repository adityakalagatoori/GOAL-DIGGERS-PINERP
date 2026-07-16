import { apiFetch, buildQuery } from './client';
import type { SalesOrder } from '../types';
import type { PinAction } from './pinApi';

export function listSalesOrders(params?: { search?: string; status?: string; dueDateFrom?: string; dueDateTo?: string }) {
  return apiFetch<SalesOrder[]>(`/api/sales${buildQuery(params ?? {})}`);
}

export function getSalesOrder(id: number) {
  return apiFetch<SalesOrder>(`/api/sales/${id}`);
}

export function createSalesOrder(data: {
  customerId: number;
  customerAddress?: string;
  salesPersonId?: number;
  dueDate?: string;
  lines: { productId: number; orderedQty: number; salesUnitPrice?: number }[];
}) {
  return apiFetch<SalesOrder>('/api/sales', { method: 'POST', body: data });
}

export function updateSalesOrder(id: number, data: Partial<{ customerId: number; customerAddress: string; salesPersonId: number; dueDate: string; lines: { productId: number; orderedQty: number; salesUnitPrice?: number }[] }>) {
  return apiFetch<SalesOrder>(`/api/sales/${id}`, { method: 'PATCH', body: data });
}

export function deleteSalesOrder(id: number) {
  return apiFetch<void>(`/api/sales/${id}`, { method: 'DELETE' });
}

// `actions` are the checked PIN checkpoint boxes. Omitted/empty = "Confirm as
// Normal" (default vendor, no qty change, no expedite).
export function confirmSalesOrder(id: number, actions: PinAction[] = []) {
  return apiFetch<SalesOrder>(`/api/sales/${id}/confirm`, { method: 'POST', body: { actions } });
}

export function deliverSalesOrder(id: number, lines: { lineId: number; deliveredQty: number }[]) {
  return apiFetch<SalesOrder>(`/api/sales/${id}/deliver`, { method: 'POST', body: { lines } });
}

export function cancelSalesOrder(id: number) {
  return apiFetch<SalesOrder>(`/api/sales/${id}/cancel`, { method: 'POST' });
}
