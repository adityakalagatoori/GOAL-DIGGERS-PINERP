import { apiFetch } from './client';
import type { ActiveSession, LoginHistory } from '../types';

export function listActiveSessions() {
  return apiFetch<ActiveSession[]>('/api/sessions/active');
}

export function getLoginHistory() {
  return apiFetch<LoginHistory[]>('/api/sessions/history');
}

export function forceLogout(sessionId: string) {
  return apiFetch<void>(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

export function forceLogoutUser(userId: number) {
  return apiFetch<void>(`/api/sessions/user/${userId}/all`, { method: 'DELETE' });
}
