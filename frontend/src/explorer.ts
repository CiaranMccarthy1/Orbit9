import { API_BASE, fetchJson } from './api';
import { initSessionUI } from './auth';
import { SKY_SURVEY } from './config';
import { readExplorerUrlState } from './urlState';
import { surveyReachable } from './survey';

interface Band { url: string; array: number; em_min_um: number; em_max_um: number }
interface Exposure { t_iso: string; bands: Band[] }

export function initExplorer(): void {
  const coordinates = document.getElementById('coordinates')!;
  const statusText = document.getElementById('status-text')!;
  const spinner = document.getElementById('loading-spinner')!;
  const controls = document.getElementById('controls')!;
  const epoch = document.getElementById('epoch') as HTMLInputElement;
  const band = document.getElementById('band') as HTMLInputElement;
  const image = document.getElementById('frame') as HTMLImageElement;
  const fallback = document.getElementById('fallback')!;
  const fallbackLabel = document.getElementById('fallback-label')!;
  const state = readExplorerUrlState();
  const { ra, dec } = state;
  const claim = document.createElement('a');
  claim.className = 'btn';
  claim.href = `/catalog?ra=${ra}&dec=${dec}`;
  claim.textContent = 'Claim this position';
  coordinates.after(claim);
  coordinates.textContent = `RA ${ra.toFixed(5)}°, Dec ${dec.toFixed(5)}°`;
  let request = 0;
  let fallbackStarted = false;
  let timer: number | undefined;
  let imageTimer: number | undefined;
  let preferredWavelength: number | undefined;
  const retry = document.getElementById('retry-spherex')!;
  const epochValue = document.getElementById('epoch-value')!;
  const bandValue = document.getElementById('band-value')!;

  const setLoading = (message: string) => {
    statusText.textContent = message;
    spinner.hidden = !message;
  };

  async function showFallback(reason: string, current = request): Promise<void> {
    image.hidden = true;
    retry.hidden = false;
    fallback.hidden = false;
    fallbackLabel.textContent = `${reason} Showing the allWISE color sky image as a fallback.`;
    setLoading('Loading fallback sky image…');
    if (fallbackStarted) { setLoading(''); return; }
    fallbackStarted = true;
    try {
      if (!(await surveyReachable())) throw new Error('survey unavailable');
      const { default: A } = await import('aladin-lite');
      await A.init;
      if (current !== request) { fallbackStarted = false; return; }
      A.aladin('#fallback-map', {
        survey: SKY_SURVEY,
        target: `${ra} ${dec}`,
        fov: Math.min(state.fov, 1),
        showCooGrid: false,
        showReticle: true,
        showFullscreenControl: false,
        showLayersControl: false,
        showZoomControl: true,
      });
      if (current === request) setLoading('');
    } catch {
      fallbackStarted = false;
      if (current !== request) return;
      fallbackLabel.textContent = `${reason} The allWISE fallback image could not be loaded either.`;
      setLoading('');
    }
  }

  async function load(): Promise<void> {
    try {
      const params = new URLSearchParams({ ra: String(ra), dec: String(dec) });
      const { exposures } = await fetchJson<{ exposures: Exposure[] }>(`/frames?${params}`);

      if (!exposures.length) {
        await showFallback('No SPHEREx observations were found at this position.');
        return;
      }
      exposures.sort((a, b) => a.t_iso.localeCompare(b.t_iso));
      for (const exposure of exposures) exposure.bands.sort((a, b) => a.em_min_um - b.em_min_um);
      epoch.max = String(exposures.length - 1);
      epoch.value = epoch.max;
      epoch.disabled = exposures.length < 2;
      controls.hidden = false;

      const selectedBand = () => exposures[Number(epoch.value)].bands[Number(band.value)];
      const render = async (current: number) => {
        const selected = selectedBand();
        if (!selected) {
          await showFallback('This observation has no usable SPHEREx bands.', current);
          return;
        }
        setLoading('Loading SPHEREx image… This may take a while.');
        try {
          const result = await fetchJson<{ png: string }>(`/render?${new URLSearchParams({ url: selected.url })}`);
          if (current !== request) return;
          // Load off-screen so an older PNG event cannot reveal the wrong selection.
          const pending = new Image();
          imageTimer = window.setTimeout(() => {
            if (current === request) void showFallback('The SPHEREx image request timed out.', current);
          }, 3000);
          pending.onload = () => {
            if (current !== request) return;
            window.clearTimeout(imageTimer);
            image.src = pending.src;
            image.alt = `SPHEREx ${epochValue.textContent}, ${bandValue.textContent}`;
            image.hidden = false;
            fallback.hidden = true;
            fallbackLabel.textContent = '';
            retry.hidden = true;
            setLoading('');
          };
          pending.onerror = () => {
            if (current !== request) return;
            window.clearTimeout(imageTimer);
            void showFallback('Could not load the SPHEREx image.', current);
          };
          pending.src = new URL(result.png, API_BASE ? new URL(API_BASE, location.origin) : location.origin).href;
        } catch (error) {
          if (current === request) await showFallback(error instanceof Error ? error.message : 'Could not render the SPHEREx image.', current);
        }
      };
      const update = (timeChanged: boolean, delay = 180) => {
        const current = ++request;
        window.clearTimeout(timer);
        window.clearTimeout(imageTimer);
        image.hidden = true;
        const exposure = exposures[Number(epoch.value)];
        epochValue.textContent = exposure.t_iso.replace('T', ' ') + ' UTC';
        epoch.setAttribute('aria-valuetext', epochValue.textContent);
        band.max = String(Math.max(0, exposure.bands.length - 1));
        band.disabled = exposure.bands.length < 2;
        if (timeChanged) band.value = String(nearestBand(exposure.bands, preferredWavelength));
        const selected = selectedBand();
        if (selected) preferredWavelength = (selected.em_min_um + selected.em_max_um) / 2;
        bandValue.textContent = selected ? `Array ${selected.array} · ${selected.em_min_um.toFixed(2)}–${selected.em_max_um.toFixed(2)} μm` : 'No bands';
        band.setAttribute('aria-valuetext', bandValue.textContent);
        setLoading('Loading selected observation…');
        timer = window.setTimeout(() => void render(current), delay);
      };
      epoch.addEventListener('input', () => update(true));
      band.addEventListener('input', () => update(false));
      retry.onclick = () => update(false, 0);
      update(true, 0);
    } catch (error) {
      await showFallback(error instanceof Error ? error.message : 'Could not retrieve SPHEREx observations.');
    }
  }
  retry.onclick = () => { ++request; void load(); };
  void load();
}

function nearestBand(bands: Band[], wavelength?: number): number {
  if (!bands.length || wavelength === undefined) return 0;
  let nearest = 0;
  for (let i = 1; i < bands.length; i++) {
    const distance = (b: Band) => Math.abs((b.em_min_um + b.em_max_um) / 2 - wavelength);
    if (distance(bands[i]) < distance(bands[nearest])) nearest = i;
  }
  return nearest;
}

initExplorer();
void initSessionUI();
