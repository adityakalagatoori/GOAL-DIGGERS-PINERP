import { apiFetch } from './client';
import type { CompanySettings } from '../types';

export function getCompanySettings() {
  return apiFetch<CompanySettings>('/api/company');
}

export function updateCompanySettings(data: Partial<CompanySettings>) {
  return apiFetch<CompanySettings>('/api/company', { method: 'PATCH', body: data });
}
