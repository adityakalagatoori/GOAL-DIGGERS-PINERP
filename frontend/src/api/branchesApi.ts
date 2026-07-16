import { apiFetch } from './client';
import type { Branch } from '../types';

export function listBranches() {
  return apiFetch<Branch[]>('/api/branches');
}

export function createBranch(data: { name: string; city?: string }) {
  return apiFetch<Branch>('/api/branches', { method: 'POST', body: data });
}

export function updateBranch(id: number, data: Partial<Branch>) {
  return apiFetch<Branch>(`/api/branches/${id}`, { method: 'PATCH', body: data });
}

export function deleteBranch(id: number) {
  return apiFetch<void>(`/api/branches/${id}`, { method: 'DELETE' });
}
