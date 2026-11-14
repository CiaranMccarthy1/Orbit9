// path: src/features/explorer/explorer.ts
import { readUrl } from './urlState';
import { mountTimeline } from './ui/timeline';
import { mountSpectra } from './ui/spectra';

const EPOCHS = ['2025-05-01', '2025-11-01', '2026-05-01', '2026-11-01', '2027-05-01', '2027-11-01'];

const BANDS = [
  { label: 'Water Ice · R', um: 3.0, color: '#f87171', tag: 'bg-red-500/15 text-red-300' },
  { label: 'CO₂ · G', um: 4.26, color: '#4ade80', tag: 'bg-green-500/15 text-green-300' },
  { label: 'CO · B', um: 4.67, color: '#60a5fa', tag: 'bg-blue-500/15 text-blue-300' },
];

const pct = (um: number) => ((um - 0.75) / 4.25) * 100;

const hms = (ra: number) => {
  const h = ra / 15;
  return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m`;
};
const dms = (dec: number) => {
  const a = Math.abs(dec);
  return `${dec < 0 ? '-' : '+'}${Math.floor(a)}° ${Math.floor((a % 1) * 60)}'`;
};

const card = (title: string, hint: string, body: string) => `
  <section class="card">
    <div class="mb-2.5 flex items-baseline justify-between gap-2">
      <h2 class="font-display text-sm font-semibold text-white">${title}</h2>
      <p class="text-[11px] text-slate-400">${hint}</p>
    </div>
    ${body}
  </section>`;

const row = (k: string, v: string, id = '') =>
  `<div class="flex justify-between border-b border-slate-800 py-1.5 last:border-0">
     <dt class="text-slate-400">${k}</dt>
     <dd id="${id}" class="tabular-nums text-slate-100">${v}</dd>
   </div>`;

export function mountExplorer(root: HTMLElement) {
  const h = readUrl() ?? { ra: 269.45, dec: 4.69, fov: 0.5 };

  const imgUrl =
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` +
    `?hips=CDS%2FP%2FallWISE%2Fcolor&width=1200&height=900&fov=${h.fov}` +
    `&projection=TAN&coordinates=icrs&ra=${h.ra}&dec=${h.dec}&format=jpg`;

  root.innerHTML = `
  <div class="mx-auto flex max-w-[96rem] flex-col px-4 py-3 sm:px-6 lg:h-dvh lg:overflow-hidden lg:px-8 lg:py-4">

    <header class="mb-2 flex shrink-0 items-center justify-between">
      <a href="/" class="font-display text-lg font-semibold text-white">Orbit<span class="text-emerald-400">9</span></a>
      <a href="/" class="btn border-emerald-400/60 py-1.5 text-emerald-400">← Back to sky map</a>
    </header>

    <div class="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-1">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">NASA/IPAC IRSA • SPHEREx Explorer</p>
        <h1 class="font-display text-xl font-bold text-white sm:text-2xl">Explore your selected region</h1>
      </div>
      <p class="text-xs text-slate-400 sm:text-sm">
        RA ${hms(h.ra)} · DEC ${dms(h.dec)} · ${h.fov}° field of view
      </p>
    </div>

    <div class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_27rem] xl:grid-cols-[minmax(0,1fr)_31rem]">

      <!-- Sky viewer + timeline -->
      <section aria-label="Sky viewer" class="flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 lg:h-full">
        <div class="star-field relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <img id="sky" src="${imgUrl}" alt="Sky patch"
            class="relative h-full w-full object-contain opacity-0 transition-opacity duration-700">
          <span id="chip" class="pointer-events-none absolute left-3 top-3 rounded-full border border-emerald-400/30 bg-slate-900/90 px-3 py-1 text-xs tabular-nums text-emerald-300"></span>
          <span class="pointer-events-none absolute right-3 top-3 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1 text-xs text-slate-300">FoV ${h.fov}°</span>
        </div>
        <div id="timeline" class="shrink-0 border-t border-slate-800 bg-slate-950/90 px-4 py-3"></div>
      </section>

      <!-- Sidebar -->
      <aside class="space-y-3 lg:h-full lg:overflow-y-auto lg:pr-1">

        ${card('Spectrum', '102 infrared bands', `<div id="spectra"></div>`)}

        ${card('Spectral Lab', 'RGB channel bands', `
          <div class="space-y-2.5">
            ${BANDS.map((b) => `
              <div>
                <div class="mb-0.5 flex items-center justify-between">
                  <span class="rounded-md px-2 py-0.5 text-xs font-medium ${b.tag}">${b.label}</span>
                  <span class="text-xs tabular-nums text-slate-400"><span class="band-val">${b.um}</span> µm</span>
                </div>
                <input type="range" min="0.75" max="5" step="0.01" value="${b.um}"
                  style="--c:${b.color};--p:${pct(b.um)}%" class="band smooth w-full">
              </div>`).join('')}
          </div>`)}

        ${card('Detector', 'H2RG detector arrays', `
          <div id="arrays" class="grid grid-cols-3 gap-2">
            ${[1, 2, 3, 4, 5, 6].map((n) => `
              <button data-on="false"
                class="rounded-xl border border-slate-700 py-1.5 text-xs font-medium text-slate-100 transition-colors active:scale-95
                       hover:border-emerald-400
                       data-[on=true]:border-emerald-400 data-[on=true]:bg-emerald-400 data-[on=true]:text-slate-950">Array ${n}</button>`).join('')}
          </div>`)}

        ${card('Stack mode', 'Co-add all epochs', `
          <button id="stack" role="switch" aria-checked="false" data-on="false"
            class="group flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/90 px-3.5 py-2">
            <span id="stack-label" class="text-sm font-medium text-slate-100">Off</span>
            <span class="relative h-6 w-12 rounded-full bg-slate-700 transition-colors duration-300 group-data-[on=true]:bg-emerald-400">
              <span class="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 group-data-[on=true]:translate-x-6"></span>
            </span>
          </button>`)}

        ${card('Region details', 'Pointing coordinates', `
          <dl class="rounded-xl border border-slate-800 bg-slate-950/90 px-3.5 text-xs sm:text-sm">
            ${row('RA', h.ra + '°')}
            ${row('Dec', h.dec + '°')}
            ${row('Field of view', h.fov + '°')}
            ${row('Epoch', '—', 'info-epoch')}
          </dl>`)}

      </aside>
    </div>
  </div>`;

  const q = (s: string) => root.querySelector<HTMLElement>(s)!;

  // Fade the sky image in once loaded
  const sky = q('#sky') as HTMLImageElement;
  const reveal = () => sky.classList.remove('opacity-0');
  sky.onload = reveal;
  if (sky.complete) reveal();

  // Spectral Lab sliders
  root.querySelectorAll<HTMLInputElement>('.band').forEach((input, i) => {
    input.oninput = () => {
      root.querySelectorAll('.band-val')[i].textContent = input.value;
      input.style.setProperty('--p', `${pct(+input.value)}%`);
    };
  });

  // Detector: one array at a time (click again to deselect)
  const arrays = q('#arrays');
  arrays.onclick = (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const on = btn.dataset.on !== 'true';
    arrays.querySelectorAll('button').forEach((b) => (b.dataset.on = 'false'));
    btn.dataset.on = String(on);
  };

  // Stack mode switch
  const stack = q('#stack');
  stack.onclick = () => {
    const on = stack.dataset.on !== 'true';
    stack.dataset.on = String(on);
    stack.setAttribute('aria-checked', String(on));
    q('#stack-label').textContent = on ? 'On' : 'Off';
  };

  mountSpectra(q('#spectra'));

  mountTimeline(q('#timeline'), EPOCHS, (i) => {
    q('#info-epoch').textContent = EPOCHS[i];
    q('#chip').textContent = `Epoch ${i + 1} of ${EPOCHS.length} · ${EPOCHS[i]}`;
  });
}