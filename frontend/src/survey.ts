import { SKY_SURVEY } from './config';

/**
 * A.init resolves when Aladin's script loads, not when its survey tiles do.
 * Probe the HiPS properties first so a dead survey shows our own message
 * instead of a blank map.
 */
export async function surveyReachable(timeoutMs = 8000): Promise<boolean> {
  try {
    const response = await fetch(`${SKY_SURVEY}/properties`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}
