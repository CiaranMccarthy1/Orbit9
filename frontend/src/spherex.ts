import { API_BASE, fetchJson } from './api';
import { byId } from './dom';

interface Band { array: number; em_min_um: number; em_max_um: number; url: string }
interface Exposure { t_iso: string; bands: Band[] }

let request = 0;
let render = 0;
let timer: number | undefined;

export async function showSpherexImages(ra: number, dec: number, renderInitial = true): Promise<void> {
  const current = ++request;
  ++render;
  window.clearTimeout(timer);
  const status = byId('spherex-status');
  const epoch = byId<HTMLInputElement>('main-epoch');
  const bandSlider = byId<HTMLInputElement>('main-band');
  const date = byId('main-epoch-value');
  const wavelength = byId('main-band-value');
  const images = byId('spherex-images');
  epoch.disabled = bandSlider.disabled = true;
  date.textContent = wavelength.textContent = 'Loading…';
  epoch.oninput = bandSlider.oninput = null;
  images.replaceChildren();
  status.textContent = 'Searching SPHEREx observations…';

  try {
    const params = new URLSearchParams({ ra: String(ra), dec: String(dec), radius: '0.05' });
    const { exposures } = await fetchJson<{ exposures: Exposure[] }>(`/frames?${params}`);
    if (current !== request) return;
    exposures.sort((a, b) => a.t_iso.localeCompare(b.t_iso));
    for (const exposure of exposures) exposure.bands.sort((a, b) => a.em_min_um - b.em_min_um);
    if (!exposures.length) {
      date.textContent = wavelength.textContent = 'No observations';
      status.textContent = 'No SPHEREx observations cover this position.';
      return;
    }

    epoch.max = String(exposures.length - 1);
    epoch.value = epoch.max;
    epoch.disabled = exposures.length < 2;
    let preferred: number | undefined;
    const selectedExposure = () => exposures[Number(epoch.value)];
    const updateLabels = (timeChanged: boolean) => {
      const exposure = selectedExposure();
      date.textContent = exposure.t_iso.replace('T', ' ') + ' UTC';
      epoch.setAttribute('aria-valuetext', date.textContent);
      bandSlider.max = String(Math.max(0, exposure.bands.length - 1));
      bandSlider.disabled = exposure.bands.length < 2;
      if (timeChanged) {
        let nearest = 0;
        if (preferred !== undefined) {
          const distance = (b: Band) => Math.abs((b.em_min_um + b.em_max_um) / 2 - preferred!);
          exposure.bands.forEach((b, i) => {
            if (distance(b) < distance(exposure.bands[nearest])) nearest = i;
          });
        }
        bandSlider.value = String(nearest);
      }
      const selected = exposure.bands[Number(bandSlider.value)];
      if (selected) preferred = (selected.em_min_um + selected.em_max_um) / 2;
      wavelength.textContent = selected ? `Array ${selected.array} · ${selected.em_min_um.toFixed(2)}–${selected.em_max_um.toFixed(2)} μm` : 'No bands';
      bandSlider.setAttribute('aria-valuetext', wavelength.textContent);
      return selected;
    };
    const draw = async (bands: Band[], active: number) => {
      const isCurrent = () => current === request && active === render;
      if (!isCurrent()) return;
      images.replaceChildren();
      const observation = date.textContent;
      status.textContent = bands.length ? `Loading SPHEREx images for RA ${ra.toFixed(5)}°, Dec ${dec.toFixed(5)}° · ${observation}…` : 'No usable bands in this observation.';
      await Promise.all(bands.map(async (band) => {
        const card = document.createElement('figure');
        const caption = document.createElement('figcaption');
        caption.className = 'py-2 text-sm text-slate-300';
        caption.textContent = `Array ${band.array} · ${band.em_min_um.toFixed(2)}–${band.em_max_um.toFixed(2)} μm`;
        const image = document.createElement('img');
        image.className = 'aspect-square w-full rounded-xl border border-slate-800 bg-slate-950 object-contain';
        image.alt = `${observation} · ${caption.textContent}`;
        card.append(image, caption);
        images.append(card);
        try {
          const result = await fetchJson<{ png: string }>(`/render?${new URLSearchParams({ url: band.url })}`);
          if (isCurrent()) image.src = new URL(result.png, API_BASE ? new URL(API_BASE, location.origin) : location.origin).href;
        } catch (error) {
          if (isCurrent()) caption.textContent += ` · ${error instanceof Error ? error.message : 'image unavailable'}`;
        }
      }));
      if (isCurrent() && bands.length) status.textContent = `Observation: ${observation} · RA ${ra.toFixed(5)}°, Dec ${dec.toFixed(5)}°`;
    };
    const select = (timeChanged: boolean) => {
      const active = ++render;
      window.clearTimeout(timer);
      const selected = updateLabels(timeChanged);
      images.replaceChildren();
      status.textContent = 'Loading selected SPHEREx image below the map…';
      timer = window.setTimeout(() => void draw(selected ? [selected] : [], active), 180);
    };
    epoch.oninput = () => select(true);
    bandSlider.oninput = () => select(false);
    updateLabels(true);
    if (renderInitial) await draw(selectedExposure().bands, ++render);
    else status.textContent = 'Use the time and IR sliders to load images for the starting sky position, or select a point on the map.';
  } catch (error) {
    if (current === request) {
      date.textContent = wavelength.textContent = 'Unavailable';
      status.textContent = error instanceof Error ? error.message : 'Could not retrieve SPHEREx images.';
    }
  }
}
