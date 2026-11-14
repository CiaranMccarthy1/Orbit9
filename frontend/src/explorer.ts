import { API_BASE, fetchJson } from './api';
import { readExplorerUrlState } from './urlState';

interface Band { url: string; array: number; em_min_um: number; em_max_um: number }
interface Exposure { t_iso: string; bands: Band[] }

export function initExplorer(): void {
  document.body.innerHTML = `<main class="mx-auto max-w-5xl space-y-6 px-4 py-8">
    <a href="/" class="btn">← Back to sky map</a>
    <h1 class="font-display text-3xl font-bold text-white">SPHEREx Explorer</h1>
    <p id="coordinates" class="text-slate-400"></p>
    <p id="explorer-status" role="status" aria-live="polite">Searching SPHEREx observations…</p>
    <div id="controls" hidden class="flex flex-wrap gap-4">
      <label>Observation <select id="epoch" class="ml-2 rounded bg-slate-800 p-2 text-white"></select></label>
      <label>Detector band <select id="band" class="ml-2 rounded bg-slate-800 p-2 text-white"></select></label>
    </div>
    <img id="frame" class="max-h-[75vh] w-full object-contain" hidden alt="SPHEREx observation" />
  </main>`;
  const coordinates = document.getElementById('coordinates')!;
  const status = document.getElementById('explorer-status')!;
  const controls = document.getElementById('controls')!;
  const epoch = document.getElementById('epoch') as HTMLSelectElement;
  const band = document.getElementById('band') as HTMLSelectElement;
  const image = document.getElementById('frame') as HTMLImageElement;
  const { ra, dec } = readExplorerUrlState();
  coordinates.textContent = `RA ${ra.toFixed(5)}°, Dec ${dec.toFixed(5)}°`;
  let request = 0;

  async function load(): Promise<void> {
    try {
      const params = new URLSearchParams({ ra: String(ra), dec: String(dec) });
      const { exposures } = await fetchJson<{ exposures: Exposure[] }>(`/frames?${params}`);
      if (!exposures.length) {
        status.textContent = 'No SPHEREx observations found at this position.';
        return;
      }
      exposures.forEach((e, i) => epoch.add(new Option(e.t_iso.replace('T', ' ') + ' UTC', String(i))));
      epoch.value = String(exposures.length - 1);
      controls.hidden = false;

      const render = async () => {
        const current = ++request;
        image.hidden = true;
        status.textContent = 'Loading SPHEREx image… This may take a while.';
        try {
          const selected = exposures[Number(epoch.value)].bands[Number(band.value)];
          const result = await fetchJson<{ png: string }>(`/render?${new URLSearchParams({ url: selected.url })}`);
          if (current !== request) return;
          image.onload = () => { if (current === request) { image.hidden = false; status.textContent = ''; } };
          image.onerror = () => { if (current === request) status.textContent = 'Could not load the rendered image.'; };
          image.src = new URL(result.png, API_BASE ? new URL(API_BASE, location.origin) : location.origin).href;
        } catch {
          if (current === request) status.textContent = 'Could not render this SPHEREx image. Please try again.';
        }
      };
      const selectEpoch = () => {
        band.replaceChildren();
        exposures[Number(epoch.value)].bands.forEach((b, i) => band.add(new Option(
          `Array ${b.array}: ${b.em_min_um.toFixed(2)}–${b.em_max_um.toFixed(2)} μm`, String(i))));
        if (band.options.length) void render();
        else { ++request; image.hidden = true; status.textContent = 'No image bands in this observation.'; }
      };
      epoch.addEventListener('change', selectEpoch);
      band.addEventListener('change', () => void render());
      selectEpoch();
    } catch {
      status.textContent = 'Could not retrieve SPHEREx observations. The data service may be unavailable; please try again.';
    }
  }
  void load();
}
