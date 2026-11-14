import * as api from './api';
import { STORAGE_KEYS } from './config';

export const getToken = (): string | null => localStorage.getItem(STORAGE_KEYS.authToken);

/** Returns the signed-in username, or null. Clears a stale token if the server rejects it. */
export async function getCurrentUser(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    return (await api.getMe(token)).username;
  } catch (err) {
    if (err instanceof api.ApiError && err.status === 401) localStorage.removeItem(STORAGE_KEYS.authToken);
    return null; // offline or expired: show the signed-out state
  }
}

export async function login(username: string, password: string): Promise<void> {
  const { access_token } = await api.login(username, password);
  localStorage.setItem(STORAGE_KEYS.authToken, access_token);
}

/** Creates the account, then signs in so the student doesn't have to type it all again. */
export async function register(username: string, password: string): Promise<void> {
  await api.register(username, password);
  await login(username, password);
}

/** Always clears the local token, even if the server call fails. */
export async function logout(): Promise<void> {
  const token = getToken();
  localStorage.removeItem(STORAGE_KEYS.authToken);
  if (token) await api.logout(token).catch(() => undefined);
}
