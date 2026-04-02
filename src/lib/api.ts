import type { AppSettings, AppStateSnapshot } from '@/lib/app-types';

const API_BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchAppState() {
  const result = await request<{ data: AppStateSnapshot | null }>('/state');
  return result.data;
}

export async function bootstrapAppState(snapshot: AppStateSnapshot) {
  const result = await request<{ data: AppStateSnapshot; bootstrapped: boolean }>('/bootstrap', {
    method: 'POST',
    body: JSON.stringify(snapshot),
  });
  return result.data;
}

export async function persistAppState(snapshot: AppStateSnapshot) {
  await request<{ ok: true }>('/state', {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  });
}

export async function fetchSettings() {
  const result = await request<{ data: AppSettings | null }>('/settings');
  return result.data;
}

export async function persistSettings(settings: AppSettings) {
  await request<{ ok: true }>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

