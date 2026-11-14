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

export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\\x00-\x20]/.test(next)) return '/catalog';
  return next;
}

export function signinUrl(next = location.pathname + location.search): string {
  return `/signin?${new URLSearchParams({ next: safeNext(next) })}`;
}

export async function initSessionUI(onChange?: (user: string | null) => void): Promise<string | null> {
  const container = document.getElementById('session-ui')!;
  const user = await getCurrentUser();
  container.replaceChildren();
  if (user) {
    const label = document.createElement('span');
    label.textContent = `@${user}`;
    const button = document.createElement('button');
    button.className = 'btn';
    button.textContent = 'Sign out';
    button.onclick = async () => { await logout(); await initSessionUI(onChange); };
    container.append(label, button);
  } else {
    const link = document.createElement('a');
    link.href = signinUrl();
    link.className = 'btn';
    link.textContent = 'Sign in';
    container.append(link);
  }
  onChange?.(user);
  return user;
}
