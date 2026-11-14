export interface Target {
  name: string;
  ra: number;
  dec: number;
  description?: string;
}

export const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? '';

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(errorMessage(error?.detail, response.status));
  }
  return response.json() as Promise<T>;
}

export function getTargets(): Promise<Target[]> {
  return fetchJson<Target[]>('/targets');
}

export interface Discovery { id: number; name: string; ra: number; dec: number; discovered_by: string; discovered_at: string; classification: Classification | null }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Please try again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, errorMessage(data?.detail, response.status));
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const getDiscoveries = (offset = 0, limit = 50) => request<Discovery[]>(`/discoveries?limit=${limit}&offset=${offset}`);
export const register = (username: string, password: string) => request('/register', 'POST', { username, password });
export const login = (username: string, password: string) => request<{ access_token: string }>('/login', 'POST', { username, password });
export const getMe = (token: string) => request<{ username: string }>('/me', 'GET', undefined, token);
export const logout = (token: string) => request('/logout', 'POST', undefined, token);
export const createDiscovery = (token: string, body: { name: string; ra: number; dec: number }) => request<Discovery>('/discoveries', 'POST', body, token);

export interface Classification { classification: string; confidence?: number; error?: string }
export function classificationText(result: Classification | null): string {
  if (!result) return 'Classifying…';
  return result.classification + (result.error ? ' · Retry scheduled' : '') + (result.confidence === undefined ? '' : ` · ${Math.round(result.confidence * 100)}% heuristic confidence`);
}
export function errorMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((issue) => {
    const field = issue.loc?.at(-1);
    if (field === 'username') return 'Username must be 1–64 letters, numbers or underscores.';
    if (field === 'password') return 'Password must be 8–128 characters.';
    return `${field ?? 'Input'}: ${issue.msg ?? 'Invalid value'}`;
  }).join(' ');
  return `Request failed (${status}).`;
}
