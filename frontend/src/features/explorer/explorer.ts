// path: src/features/explorer/explorer.ts
import { readUrl } from './urlState';
import { mountTimeline } from './ui/timeline';
import { mountSpectra } from './ui/spectra';

const EPOCHS = ['2025-05-01', '2025-11-01', '2026-05-01', '2026-11-01', '2027-05-01', '2027-11-01'];

const BANDS = [
  { label: 'Water Ice · R', um: 3.0, color: '#f87171', pill: 'bg-red-500/10 text-red-300' },
  { label: 'CO₂ · G', um: 4.26, color: '#4ade80', pill: 'bg-green-500/10 text-green-300' },
  { label: 'CO · B', um: 4.67, color: '#60a5fa', pill: 'bg-blue-500/10 text-blue-300' },
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

const card = (title: string, body: string) => `
  <section class="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
    <h2 class="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">${title}</h2>
    ${body}
  </section>`;

const row = (k: string, v: string, id = '') =>
  `<div class="flex justify-between"><dt class="text-slate-500">${k}</dt><dd id="${id}" class="tabular-nums text-slate-200">${v}</dd></div>`;

export function mountExplorer(root: HTMLElement) {
  const h = readUrl() ?? { ra: 269.45, dec: 4.69, fov: 0.5 };

  const imgUrl =
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` +
    `?hips=CDS%2FP%2FallWISE%2Fcolor&width=900&height=700&fov=${h.fov}` +
    `&projection=TAN&coordinates=icrs&ra=${h.ra}&dec=${h.dec}&format=jpg`;

  root.innerHTML = `
  <div class="flex h-screen w-screen flex-col bg-[#05060a] text-sm text-slate-300 antialiased">

    <header class="flex items-baseline gap-4 px-6 pt-5 pb-4">
      <h1 class="text-base font-medium tracking-tight text-white">Explore your selected region</h1>
      <p class="text-xs tabular-nums text-slate-500">RA ${hms(h.ra)} · DEC ${dms(h.dec)}</p>
    </header>

    <div class="flex min-h-0 flex-1 gap-4 px-6 pb-4">

      <main class="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-3xl bg-black ring-1 ring-white/[0.06]">
        <img id="sky" src="${imgUrl}" alt="Sky patch"
          class="max-h-full max-w-full object-contain opacity-0 transition-opacity duration-700">
        <span id="chip" class="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs tabular-nums text-slate-200 ring-1 ring-white/10 backdrop-blur"></span>
        <span class="absolute bottom-4 right-4 rounded-full bg-black/50 px-3 py-1 text-xs text-slate-400 ring-1 ring-white/10 backdrop-blur">FoV ${h.fov}°</span>
      </main>

        <aside class="w-96 shrink-0 space-y-3 overflow-y-auto">

        ${card('Spectrum', `<div id="spectra"></div>`)}

        ${card('Spectral Lab', `
          <div class="space-y-4">
            ${BANDS.map((b) => `
              <div>
                <div class="mb-1 flex items-center justify-between">
                  <span class="rounded-full px-2.5 py-0.5 text-xs ${b.pill}">${b.label}</span>
                  <span class="text-xs tabular-nums text-slate-500"><span class="band-val">${b.um}</span> µm</span>
                </div>
                <input type="range" min="0.75" max="5" step="0.01" value="${b.um}"
                  style="--c:${b.color};--p:${pct(b.um)}%" class="band smooth w-full">
              </div>`).join('')}
          </div>`)}

        ${card('Detector', `
          <div id="arrays" class="grid grid-cols-3 gap-2">
            ${[1, 2, 3, 4, 5, 6].map((n) => `
              <button data-on="false"
                class="rounded-lg bg-white/5 py-2 text-xs transition active:scale-95
                       hover:bg-violet-500/20
                       data-[on=true]:bg-violet-500 data-[on=true]:text-white
                       data-[on=true]:shadow-[0_0_14px_rgb(139_92_246/0.5)]">${n}</button>`).join('')}
          </div>`)}

        ${card('Stack mode', `
          <button id="stack" role="switch" aria-checked="false" data-on="false"
            class="group flex w-full items-center justify-between">
            <span id="stack-label" class="text-sm text-slate-300">Off</span>
            <span class="relative h-7 w-14 rounded-full bg-white/10 transition-colors duration-300 group-data-[on=true]:bg-violet-500">
              <span class="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 group-data-[on=true]:translate-x-7"></span>
            </span>
          </button>`)}

        ${card('Region details', `
          <dl class="space-y-1.5 text-xs">
            ${row('RA', h.ra + '°')}
            ${row('Dec', h.dec + '°')}
            ${row('Field of view', h.fov + '°')}
            ${row('Epoch', '—', 'info-epoch')}
          </dl>`)}

      </aside>
    </div>

    <footer id="timeline" class="border-t border-white/[0.06] px-6 py-4"></footer>
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
    q('#chip').textContent = `Epoch ${i + 1} / ${EPOCHS.length} · ${EPOCHS[i]}`;
  });
}