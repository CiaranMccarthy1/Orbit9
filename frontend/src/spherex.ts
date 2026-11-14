import { API_BASE, fetchJson } from './api';
import { byId } from './dom';

interface Band { array: number; em_min_um: number; em_max_um: number; url: string }
interface Exposure { t_iso: string; bands: Band[] }

let request = 0;

export async function showSpherexImages(ra: number, dec: number): Promise<void> {
  const current = ++request;
  const status = byId('spherex-status');
  const images = byId('spherex-images');
  images.replaceChildren();
  status.textContent = 'Searching SPHEREx observations…';

  try {
    const params = new URLSearchParams({ ra: String(ra), dec: String(dec), radius: '0.05' });
    const { exposures } = await fetchJson<{ exposures: Exposure[] }>(`/frames?${params}`);
    if (current !== request) return;
    const latest = exposures.at(-1);
    if (!latest) {
      status.textContent = 'No SPHEREx observations cover this position.';
      return;
    }

    const bands = [...new Map(latest.bands.map((band) => [band.array, band])).values()];
    status.textContent = `Loading ${bands.length} detector images from ${latest.t_iso.replace('T', ' ')} UTC…`;
    await Promise.all(bands.map(async (band) => {
      const card = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.className = 'py-2 text-sm text-slate-300';
      caption.textContent = `Array ${band.array} · ${band.em_min_um.toFixed(2)}–${band.em_max_um.toFixed(2)} μm`;
      const image = document.createElement('img');
      image.className = 'aspect-square w-full rounded-xl border border-slate-800 bg-slate-950 object-contain';
      image.alt = caption.textContent;
      card.append(image, caption);
      if (current === request) images.append(card);
      try {
        const result = await fetchJson<{ png: string }>(`/render?${new URLSearchParams({ url: band.url })}`);
        if (current === request) image.src = new URL(result.png, API_BASE ? new URL(API_BASE, location.origin) : location.origin).href;
      } catch (error) {
        if (current === request) caption.textContent += ` · ${error instanceof Error ? error.message : 'image unavailable'}`;
      }
    }));
    if (current === request) status.textContent = `Latest observation: ${latest.t_iso.replace('T', ' ')} UTC`;
  } catch (error) {
    if (current === request) status.textContent = error instanceof Error ? error.message : 'Could not retrieve SPHEREx images.';
  }
}
