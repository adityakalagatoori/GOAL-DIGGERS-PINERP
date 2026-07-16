import { apiFetch, ApiError } from './client';
import type { User, Permission } from '../types';

export function listUsers(filters?: {
  search?: string; roleId?: number; departmentId?: number;
  isActive?: boolean; branchId?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.roleId !== undefined) params.set('roleId', String(filters.roleId));
  if (filters?.departmentId !== undefined) params.set('departmentId', String(filters.departmentId));
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.branchId !== undefined) params.set('branchId', String(filters.branchId));
  const qs = params.toString();
  return apiFetch<Omit<User, 'permissions'>[]>(`/api/users${qs ? `?${qs}` : ''}`);
}

export function getUser(id: number) {
  return apiFetch<User>(`/api/users/${id}`);
}

/** Minimal id/name list any authenticated user can call, for "assign to" dropdowns (Sales Person, Responsible Person, etc.) — unlike listUsers(), not admin-gated. */
export function listUserDirectory() {
  return apiFetch<{ id: number; name: string; position?: string | null }[]>('/api/users/directory');
}

export function createUser(data: {
  loginId: string; email: string; password: string; name: string;
  firstName?: string; lastName?: string; position?: string; designation?: string;
  phone?: string; joiningDate?: string; departmentId?: number; roleId?: number;
  managerId?: number; branchId?: number; isAdmin?: boolean; isActive?: boolean;
}) {
  return apiFetch<User>('/api/users', { method: 'POST', body: data });
}

export function updateUser(id: number, data: Partial<{
  name: string; address: string; mobile: string; position: string; isAdmin: boolean;
  permissions: Permission[]; designation: string; phone: string; joiningDate: string;
  departmentId: number; roleId: number; managerId: number; branchId: number; isActive: boolean;
}>) {
  return apiFetch<User>(`/api/users/${id}`, { method: 'PATCH', body: data });
}

export function disableUser(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/users/${id}/disable`, { method: 'POST' });
}

export function enableUser(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/users/${id}/enable`, { method: 'POST' });
}

export function adminResetPassword(id: number, password: string) {
  return apiFetch<{ ok: boolean }>(`/api/users/${id}/reset-password`, { method: 'POST', body: { password } });
}

export function generatePassword() {
  return apiFetch<{ password: string }>('/api/users/generate-password');
}


export function getMe() {
  return apiFetch<User>('/api/me');
}

export function updateMe(data: Partial<{ name: string; address: string; mobile: string; phone: string }>) {
  return apiFetch<User>('/api/me', { method: 'PATCH', body: data });
}

export function changeMyPassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok: boolean }>('/api/me/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Bypasses apiFetch — that wrapper always JSON.stringifies the body and sets
 * Content-Type: application/json, which would corrupt a multipart upload.
 * The browser must set its own Content-Type (with the multipart boundary)
 * for FormData, so this builds the request by hand instead. The session
 * cookie still needs `credentials: 'include'` here since this bypasses
 * apiFetch entirely.
 */
export async function uploadMyPhoto(file: File): Promise<User> {
  const formData = new FormData();
  formData.append('photo', file);

  const res = await fetch(`${BASE_URL}/api/me/photo`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `Request failed (${res.status})`, json?.details);
  return json as User;
}

/** Prefixes a backend-relative photoUrl (e.g. "/uploads/photos/x.jpg") with the API base URL so <img> can load it directly. */
export function resolvePhotoUrl(photoUrl: string | null | undefined): string | undefined {
  if (!photoUrl) return undefined;
  return `${BASE_URL}${photoUrl}`;
}
