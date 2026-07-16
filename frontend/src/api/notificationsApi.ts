import { apiFetch } from './client';
import type { Notification } from '../types';

export function listNotifications() {
  return apiFetch<Notification[]>('/api/notifications');
}

export function markRead(id: number) {
  return apiFetch<Notification>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllRead() {
  return apiFetch<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' });
}

export function deleteNotification(id: number) {
  return apiFetch<void>(`/api/notifications/${id}`, { method: 'DELETE' });
}
