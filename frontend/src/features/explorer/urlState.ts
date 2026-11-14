// path: src/features/explorer/urlState.ts
export interface Handoff { ra: number; dec: number; fov: number }
const DEFAULT_FOV = 0.5;

const valid = (ra: number, dec: number) =>
  Number.isFinite(ra) && Number.isFinite(dec) && ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90;

export function readUrl(): Handoff | null {
  const q = new URLSearchParams(location.search);
  const ra = parseFloat(q.get('ra') ?? '');
  const dec = parseFloat(q.get('dec') ?? '');
  if (!valid(ra, dec)) return null;
  return { ra, dec, fov: parseFloat(q.get('fov') ?? '') || DEFAULT_FOV };
}

export function writeUrl(p: Record<string, string | number>) {
  const q = new URLSearchParams(location.search);
  Object.entries(p).forEach(([k, v]) => q.set(k, String(v)));
  history.replaceState(null, '', `?${q}`);
}

/** Fires on mount (if URL has ra/dec), on back/forward, and on the menu's custom event. */
export function onHandoff(cb: (h: Handoff) => void) {
  window.addEventListener('planetx:handoff', (e) => {
    const d = (e as CustomEvent).detail;
    if (valid(d?.ra, d?.dec)) cb({ ra: d.ra, dec: d.dec, fov: d.fov ?? DEFAULT_FOV });
  });
  window.addEventListener('popstate', () => {
    const h = readUrl();
    if (h) cb(h);
  });
  const h = readUrl();
  if (h) cb(h);
}