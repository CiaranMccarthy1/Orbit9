import { API_BASE, fetchJson } from './api';
import A from 'aladin-lite';
import { SKY_SURVEY } from './config';
import { readExplorerUrlState } from './urlState';

interface Band { url: string; array: number; em_min_um: number; em_max_um: number }
interface Exposure { t_iso: string; bands: Band[] }

export function initExplorer(): void {
  document.body.innerHTML = `<main class="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <a href="/" class="btn">← Back to sky map</a>
    <h1 class="font-display text-3xl font-bold text-white">SPHEREx Explorer</h1>
    <p id="coordinates" class="text-slate-400"></p>
    <p id="explorer-status" role="status" aria-live="polite" class="flex items-center gap-3">
      <svg id="loading-spinner" class="h-5 w-5 animate-spin text-emerald-400" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
      <span id="status-text">Searching SPHEREx observations…</span>
    </p>
    <div id="controls" hidden class="flex flex-wrap gap-4">
      <label>Observation <select id="epoch" class="ml-2 rounded bg-slate-800 p-2 text-white"></select></label>
      <label>Detector band <select id="band" class="ml-2 rounded bg-slate-800 p-2 text-white"></select></label>
    </div>
    <img id="frame" class="max-h-[75vh] w-full object-contain" hidden alt="SPHEREx observation" />
    <div id="fallback" hidden>
      <p id="fallback-label" class="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200"></p>
      <div id="fallback-map" class="h-[28rem] w-full overflow-hidden rounded-xl border border-slate-800"></div>
    </div>
  </main>`;
  const coordinates = document.getElementById('coordinates')!;
  const status = document.getElementById('explorer-status')!;
  const statusText = document.getElementById('status-text')!;
  const spinner = document.getElementById('loading-spinner')!;
  const controls = document.getElementById('controls')!;
  const epoch = document.getElementById('epoch') as HTMLSelectElement;
  const band = document.getElementById('band') as HTMLSelectElement;
  const image = document.getElementById('frame') as HTMLImageElement;
  const fallback = document.getElementById('fallback')!;
  const fallbackLabel = document.getElementById('fallback-label')!;
  const state = readExplorerUrlState();
  const { ra, dec } = state;
  coordinates.textContent = `RA ${ra.toFixed(5)}°, Dec ${dec.toFixed(5)}°`;
  let request = 0;
  let fallbackStarted = false;

  const setLoading = (message: string) => {
    statusText.textContent = message;
    spinner.hidden = !message;
  };

  async function showFallback(reason: string): Promise<void> {
    image.hidden = true;
    controls.hidden = true;
    fallback.hidden = false;
    fallbackLabel.textContent = `${reason} Showing the allWISE color sky image as a fallback.`;
    setLoading('Loading fallback sky image…');
    if (fallbackStarted) return;
    fallbackStarted = true;
    try {
      await A.init;
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
      setTimeout(() => setLoading(''), 15000);
    } catch {
      fallbackLabel.textContent = `${reason} The allWISE fallback image could not be loaded either.`;
      setLoading('');
    }
  }

  async function load(): Promise<void> {
    try {
      const params = new URLSearchParams({ ra: String(ra), dec: String(dec) });
      const { exposures } = await fetchJson<{ exposures: Exposure[] }>(`/frames?${params}`);
      if (request) return;
      if (!exposures.length) {
        await showFallback('No SPHEREx observations were found at this position.');
        return;
      }
      exposures.forEach((e, i) => epoch.add(new Option(e.t_iso.replace('T', ' ') + ' UTC', String(i))));
      epoch.value = String(exposures.length - 1);
      controls.hidden = false;

      const render = async () => {
        const current = ++request;
        image.hidden = true;
        setLoading('Loading SPHEREx image… This may take a while.');
        try {
          const selected = exposures[Number(epoch.value)].bands[Number(band.value)];
          const result = await fetchJson<{ png: string }>(`/render?${new URLSearchParams({ url: selected.url })}`);
          if (current !== request) return;
          let imageTimer = window.setTimeout(() => {
            if (current === request && image.hidden) void showFallback('The SPHEREx image request timed out.');
          }, 15000);
          image.onload = () => {
            window.clearTimeout(imageTimer);
            if (current === request) { image.hidden = false; setLoading(''); }
          };
          image.onerror = () => {
            window.clearTimeout(imageTimer);
            if (current === request) void showFallback('Could not load the SPHEREx image.');
          };
          image.src = new URL(result.png, API_BASE ? new URL(API_BASE, location.origin) : location.origin).href;
        } catch (error) {
          if (current === request) await showFallback(error instanceof Error ? error.message : 'Could not render the SPHEREx image.');
        }
      };
      const selectEpoch = () => {
        band.replaceChildren();
        exposures[Number(epoch.value)].bands.forEach((b, i) => band.add(new Option(
          `Array ${b.array}: ${b.em_min_um.toFixed(2)}–${b.em_max_um.toFixed(2)} μm`, String(i))));
        if (band.options.length) void render();
        else { ++request; void showFallback('This observation has no SPHEREx image bands.'); }
      };
      epoch.addEventListener('change', selectEpoch);
      band.addEventListener('change', () => void render());
      selectEpoch();
    } catch (error) {
      if (!request) await showFallback(error instanceof Error ? error.message : 'Could not retrieve SPHEREx observations.');
    }
  }
  void load();
}
