export interface Target {
  name: string;
  ra: number;
  dec: number;
  description?: string;
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function getTargets(): Promise<Target[]> {
  return fetchJson<Target[]>('/targets');
}

export interface Discovery { id: number; name: string; ra: number; dec: number; discovered_by: string; discovered_at: string }
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
    throw new ApiError(response.status, typeof data?.detail === 'string' ? data.detail : `Request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const getDiscoveries = () => request<Discovery[]>('/discoveries');
export const register = (username: string, password: string) => request('/register', 'POST', { username, password });
export const login = (username: string, password: string) => request<{ access_token: string }>('/login', 'POST', { username, password });
export const getMe = (token: string) => request<{ username: string }>('/me', 'GET', undefined, token);
export const logout = (token: string) => request('/logout', 'POST', undefined, token);
export const createDiscovery = (token: string, body: { name: string; ra: number; dec: number }) => request<Discovery>('/discoveries', 'POST', body, token);
