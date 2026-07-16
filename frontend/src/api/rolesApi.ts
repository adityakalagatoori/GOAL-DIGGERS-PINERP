import { apiFetch } from './client';
import type { Role } from '../types';

export function listRoles() {
  return apiFetch<Role[]>('/api/roles');
}

export function getRole(id: number) {
  return apiFetch<Role>(`/api/roles/${id}`);
}

export function createRole(data: { label: string; permissions: any[] }) {
  return apiFetch<Role>('/api/roles', { method: 'POST', body: data });
}

export function updateRole(id: number, data: { label: string; permissions: any[] }) {
  return apiFetch<Role>(`/api/roles/${id}`, { method: 'PATCH', body: data });
}

export function deleteRole(id: number) {
  return apiFetch<void>(`/api/roles/${id}`, { method: 'DELETE' });
}
