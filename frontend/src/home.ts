import './styles.css';
import A from 'aladin-lite';

const EXPLORER_PATH = '/explorer';
const SURVEY = 'P/allWISE/color';
const BARNARD = { ra: 269.4521, dec: 4.6934 };

/* ---------- Left column: tutorial cards ---------- */

const cursor = `<svg class="h-8 w-8 drop-shadow motion-safe:animate-tap" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 7-6 2-2 6z" fill="#fff" stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

const visuals = {
  find: `<div class="star-field relative h-32 overflow-hidden rounded-xl">
    <span class="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/30 motion-safe:animate-ping"></span>
    <span class="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400"></span>
    <span class="absolute left-[52%] top-[56%]">${cursor}</span></div>`,
  instrument: `<div class="flex h-32 items-end gap-2 rounded-xl bg-slate-950 p-4" role="img" aria-label="Six SPHEREx detector arrays covering 0.75 to 5.0 micrometres">
    ${[40, 55, 70, 62, 85, 100]
      .map((h, i) => `<div class="flex-1 rounded-t-md bg-emerald-400" style="height:${h}%;opacity:${0.35 + i * 0.13}"></div>`)
      .join('')}</div>`,
  identify: `<svg viewBox="0 0 240 128" class="h-32 w-full rounded-xl bg-slate-950" role="img" aria-label="A planet and an asteroid orbiting a sun">
    <defs><radialGradient id="sun"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></radialGradient></defs>
    <ellipse cx="120" cy="64" rx="90" ry="38" fill="none" stroke="#334155" stroke-dasharray="3 5"/>
    <ellipse cx="120" cy="64" rx="52" ry="22" fill="none" stroke="#334155" stroke-dasharray="3 5"/>
    <circle cx="120" cy="64" r="15" fill="url(#sun)"/>
    <g><circle cx="210" cy="64" r="7" fill="#34d399"/>
      <animateTransform attributeName="transform" type="rotate" from="0 120 64" to="360 120 64" dur="14s" repeatCount="indefinite"/></g>
    <g><circle cx="172" cy="64" r="3" fill="#94a3b8"/>
      <animateTransform attributeName="transform" type="rotate" from="360 120 64" to="0 120 64" dur="7s" repeatCount="indefinite"/></g></svg>`,
  explore: `<div class="relative h-32 overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
      style="background-image:linear-gradient(#1e293b 1px,transparent 1px),linear-gradient(90deg,#1e293b 1px,transparent 1px);background-size:32px 32px" role="img" aria-label="Map with pins dropping onto it">
    ${[['18%', '55%', 0], ['48%', '30%', 1.2], ['76%', '62%', 2.4]]
      .map(([l, t, d]) => `<svg class="absolute h-7 w-7 motion-safe:animate-pin-drop" style="left:${l};top:${t};animation-delay:${d}s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" fill="#34d399"/><circle cx="12" cy="10" r="2.6" fill="#022c22"/></svg>`)
      .join('')}</div>`,
};

const steps = [
  { title: 'Learning to find an object', visual: visuals.find, body: 'Every object has sky coordinates: right ascension (ra) and declination (dec). Choose a named target or click the map to get them.' },
  { title: 'Point your instrument or use our tool', visual: visuals.instrument, body: 'SPHEREx scans the sky in 102 infrared bands from 0.75 to 5.0 µm on six detector arrays. Planet X fetches those frames for you, so you do not need a telescope.' },
  { title: 'Identify your target', visual: visuals.identify, body: 'Stars stay put between epochs, while asteroids and brown dwarfs shift. Compare two epochs to see what moved.' },
  { title: 'Now explore on your own', visual: visuals.explore, body: 'Drop a pin on the sky map and open that spot in the explorer with its coordinates already filled in.' },
];

document.getElementById('steps')!.innerHTML = steps
  .map(
    (s, i) => `<li class="card motion-safe:opacity-0" data-reveal="animate-slide-in" data-delay="${i * 120}">
      ${s.visual}
      <div class="mt-4 flex items-start gap-3">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-sm font-semibold text-slate-950">${i + 1}</span>
        <div><h3 class="font-display font-semibold text-white">${s.title}</h3><p class="mt-1 text-sm text-slate-400">${s.body}</p></div>
      </div></li>`
  )
  .join('');

/* ---------- Right column: content sections ---------- */

let artId = 0;
const planetArt = (c1: string, c2: string, ring = false) => {
  const id = `pa${artId++}`;
  return `<svg viewBox="0 0 160 100" class="h-full w-full" role="img" aria-label="Artist impression of an exoplanet">
    <defs><radialGradient id="${id}" cx="35%" cy="35%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
    <rect width="160" height="100" fill="#020617"/>
    <circle cx="20" cy="18" r="1" fill="#fff"/><circle cx="130" cy="14" r="1.2" fill="#fff"/><circle cx="148" cy="80" r="1" fill="#cbd5e1"/><circle cx="34" cy="86" r="1" fill="#cbd5e1"/>
    <circle cx="80" cy="50" r="30" fill="url(#${id})"/>
    ${ring ? '<ellipse cx="80" cy="50" rx="52" ry="11" fill="none" stroke="#e2e8f0" stroke-opacity=".5" stroke-width="2"/>' : ''}</svg>`;
};

// Replace with a call to your catalog endpoint when it exists.
const discoveries = [
  { name: 'TRAPPIST-1 e', note: 'Rocky planet in a seven-planet system about 40 light-years away.', art: planetArt('#7dd3fc', '#1e3a8a'), href: '/catalog/trappist-1-e' },
  { name: 'Proxima b', note: 'Orbits the closest star to the Sun, 4.2 light-years away.', art: planetArt('#fdba74', '#7c2d12'), href: '/catalog/proxima-b' },
  { name: 'K2-18 b', note: 'Sub-Neptune in the habitable zone of a red dwarf, about 124 light-years away.', art: planetArt('#a7f3d0', '#064e3b', true), href: '/catalog/k2-18-b' },
  { name: '55 Cancri e', note: 'Super-Earth so close to its star that its surface is thought to be molten.', art: planetArt('#fca5a5', '#450a0a'), href: '/catalog/55-cancri-e' },
];

document.getElementById('discoveries')!.innerHTML = discoveries
  .map(
    (d) => `<article class="card flex flex-col p-0 overflow-hidden">
      <div class="h-28">${d.art}</div>
      <div class="flex flex-1 flex-col p-4">
        <h3 class="font-display font-semibold text-white">${d.name}</h3>
        <p class="mt-1 flex-1 text-sm text-slate-400">${d.note}</p>
        <a href="${d.href}" class="btn mt-4" aria-label="Learn more about ${d.name}">Learn more</a>
      </div></article>`
  )
  .join('');

const stars = [
  { name: 'O-type blue giants', glow: 'h-20 w-20 bg-sky-400 shadow-[0_0_48px_16px_rgba(56,189,248,0.45)]', facts: ['Surface above 30,000 K', 'At least 16 times the Sun’s mass', 'Burn out within a few million years'], tip: 'Look for: blue-white, rare, usually inside young star clusters.' },
  { name: 'M-type red dwarfs', glow: 'h-8 w-8 bg-red-500 shadow-[0_0_24px_8px_rgba(239,68,68,0.4)]', facts: ['Surface below about 3,700 K', 'No more than about 0.6 solar masses', 'Can shine for trillions of years'], tip: 'Look for: faint, red, and the most common star type. Barnard’s Star is one.' },
];

document.getElementById('stars')!.innerHTML = stars
  .map(
    (s) => `<article class="card flex gap-4">
      <div class="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-slate-950"><span class="rounded-full ${s.glow}"></span></div>
      <div><h3 class="font-display font-semibold text-white">${s.name}</h3>
        <ul class="mt-2 space-y-1 text-sm text-slate-400">${s.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
        <p class="mt-2 text-sm text-emerald-400">${s.tip}</p></div></article>`
  )
  .join('');

const journey = [
  ['Exoplanet Catalog', '/catalog'],
  ['Constellations & Myths', '/constellations'],
  ['Deep Sky Objects', '/deep-sky'],
  ['Getting Started in Astronomy', '/getting-started'],
  ['SPHEREx Data Portal', 'https://irsa.ipac.caltech.edu/Missions/spherex.html'],
];

document.getElementById('journey')!.innerHTML = journey
  .map(([label, href]) => `<a class="btn text-center" href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`)
  .join('');

/* ---------- Scroll reveal (respects prefers-reduced-motion via motion-safe:opacity-0) ---------- */

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      el.style.animationDelay = `${el.dataset.delay ?? 0}ms`;
      el.classList.add(el.dataset.reveal!);
      io.unobserve(el);
    }
  },
  { threshold: 0.12 }
);
document.querySelectorAll('[data-reveal]').forEach((el) => {
  el.classList.add('motion-safe:opacity-0');
  io.observe(el);
});

/* ---------- Aladin Lite v3 ---------- */

function drawPin(source: any, ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(source.x, source.y); // tip of the pin sits on the coordinate
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-14, -14, -10, -31, 0, -31);
  ctx.bezierCurveTo(10, -31, 14, -14, 0, 0);
  ctx.fillStyle = '#34d399';
  ctx.strokeStyle = '#022c22';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -20, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#022c22';
  ctx.fill();
  ctx.restore();
}

const fmt = (n: number) => n.toFixed(5);

A.init.then(() => {
  const baseOpts = {
    survey: SURVEY,
    showFullscreenControl: false,
    showSimbadPointerControl: false,
    showCooGridControl: true,
  };

  // Hero preview: zoomed-in, decorative
  const preview: any = A.aladin('#preview-map', {
    ...baseOpts, fov: 0.5, target: `${BARNARD.ra} ${BARNARD.dec}`,
    showReticle: false, showZoomControl: false, showLayersControl: false, showGotoControl: false, showCooGridControl: false,
  });
  const previewPin: any = A.catalog({ name: 'preview-pin', shape: drawPin });
  preview.addCatalog(previewPin);
  previewPin.addSources([A.source(BARNARD.ra, BARNARD.dec)]);

  // Main all-sky map
  const aladin: any = A.aladin('#sky-map', {
    ...baseOpts, fov: 120, target: '266.4 -28.9', showCooGrid: true, showReticle: true,
  });
  const pins: any = A.catalog({ name: 'picked-pin', shape: drawPin });
  aladin.addCatalog(pins);

  const status = document.getElementById('map-status')!;
  let redirecting = false;

  aladin.on('click', (e: any) => {
    if (redirecting) return;
    // v3 click payloads vary by build: prefer ra/dec if present, else convert from pixels.
    const radec = e?.ra !== undefined ? [e.ra, e.dec] : aladin.pix2world(e.x, e.y);
    if (!radec || Number.isNaN(radec[0]) || Number.isNaN(radec[1])) {
      status.textContent = 'That point is outside the sky. Click inside the map.';
      return;
    }
    const [ra, dec] = radec as [number, number];
    redirecting = true;

    pins.removeAll();
    pins.addSources([A.source(ra, dec)]);
    aladin.gotoRaDec(ra, dec);
    status.textContent = `Opening RA ${fmt(ra)}°, Dec ${fmt(dec)}° in the explorer…`;

    const url = `${EXPLORER_PATH}?ra=${encodeURIComponent(fmt(ra))}&dec=${encodeURIComponent(fmt(dec))}`;
    window.setTimeout(() => window.location.assign(url), 700);
  });
});
