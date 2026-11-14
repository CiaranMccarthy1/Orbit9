import { SKY_SURVEY } from './config';

/**
 * A.init resolves when Aladin's script loads, not when its survey tiles do.
 * Probe the HiPS properties first so a dead survey shows our own message
 * instead of a blank map.
 */
export async function surveyReachable(timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SKY_SURVEY}/properties`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
