import { apiFetch } from './client';
import type { Department } from '../types';

export function listDepartments() {
  return apiFetch<Department[]>('/api/departments');
}

export function createDepartment(name: string) {
  return apiFetch<Department>('/api/departments', { method: 'POST', body: { name } });
}

export function updateDepartment(id: number, data: Partial<Department>) {
  return apiFetch<Department>(`/api/departments/${id}`, { method: 'PATCH', body: data });
}

export function deleteDepartment(id: number) {
  return apiFetch<void>(`/api/departments/${id}`, { method: 'DELETE' });
}
