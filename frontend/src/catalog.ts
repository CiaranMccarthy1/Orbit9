
import * as api from './api';
import * as auth from './auth';
import { buildExplorerUrl } from './urlState';

/* ---------- Small helpers ---------- */
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Escape text before putting it in innerHTML. Usernames and planet names are typed by users. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Turns a name into a stable number, so a planet always gets the same icon, colour and bars. */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

/* ---------- Look and feel (full class names so Tailwind v4 can find them) ---------- */
const ICONS = ['star', 'ringed', 'ice', 'exo'] as const;
const ACCENTS = [
  { card: 'border-[#34d399]/35 border-t-[#34d399]', bar: 'bg-[#34d399]' },
  { card: 'border-[#60a5fa]/35 border-t-[#60a5fa]', bar: 'bg-[#60a5fa]' },
  { card: 'border-[#a78bfa]/35 border-t-[#a78bfa]', bar: 'bg-[#a78bfa]' },
  { card: 'border-[#fb923c]/35 border-t-[#fb923c]', bar: 'bg-[#fb923c]' },
  { card: 'border-[#f59e0b]/35 border-t-[#f59e0b]', bar: 'bg-[#f59e0b]' },
];
const RANK_BADGES = ['bg-[#f59e0b] text-[#1a1100]', 'bg-[#60a5fa] text-[#06101f]', 'bg-[#a78bfa] text-[#120a2b]'];

/** Six bar heights from the name. Illustrative only: the real spectrum lives in the Explorer. */
function fingerprint(name: string): string {
  return Array.from({ length: 6 }, (_, i) => 25 + (hash(`${name}${i}`) % 70)).map((h) => h).join(',');
}

/* ---------- Page state ---------- */
type Filter = 'all' | 'targets' | 'finds';
let targets: api.Target[] = [];
let discoveries: api.Discovery[] = [];
let filter: Filter = 'all';
let search = '';
let user: string | null = null;

/* ---------- Rendering ---------- */
interface CardData { name: string; ra: number; dec: number; blurb: string; kind: 'target' | 'find'; username?: string; createdAt?: string; classification?: api.Classification | null }

function cardHtml(c: CardData): string {
  const h = hash(c.name);
  const accent = ACCENTS[h % ACCENTS.length];
  const bars = fingerprint(c.name).split(',').map((v, i) => `<span class="fp-bar w-2 rounded-t ${accent.bar}" style="height:${v}%;animation-delay:${i * 90}ms"></span>`).join('');
  const href = buildExplorerUrl({ ra: c.ra, dec: c.dec, fov: 0.5 }); // opens the Explorer inside its ≤1° cutout view
  const who = c.kind === 'find' ? `<span class="rounded-full bg-[#34d399]/15 px-2.5 py-0.5 text-xs font-medium text-[#34d399]">@${escapeHtml(c.username ?? '')}</span>` : '';
  return `
  <article class="card flex flex-col justify-between rounded-3xl border border-t-4 bg-[#0f1526] p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-12px_rgba(52,211,153,.3)] ${accent.card}">
    <div>
      <div class="flex items-start justify-between gap-3">
        <svg class="h-14 w-14 shrink-0" aria-hidden="true"><use href="#${ICONS[h % ICONS.length]}"/></svg>
        <div class="text-right"><div class="flex h-8 items-end justify-end gap-1" role="img" aria-label="Decorative bars">${bars}</div><p class="mt-1 text-xs text-slate-400">Decorative pattern</p></div>
      </div>
      <h3 class="mt-3 font-['Sora'] text-xl font-semibold text-white">${escapeHtml(c.name)}</h3>
      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">${who}<span class="text-slate-400">${escapeHtml(c.blurb)}</span></div>
      ${c.kind === 'find' ? `<p class="mt-3 text-sm">${escapeHtml(api.classificationText(c.classification ?? null))}</p>` : ''}
    </div>
    <div class="mt-4 border-t border-slate-700 pt-4">
      <p class="font-['JetBrains_Mono'] text-xs">RA ${c.ra.toFixed(5)}° · Dec ${c.dec.toFixed(5)}°</p>
      <a href="${href}" class="mt-3 block rounded-full bg-slate-100 py-2.5 text-center text-sm font-semibold text-[#090d1a] hover:bg-[#34d399]">${c.kind === 'find' ? 'Inspect Spectra →' : 'Open in Explorer →'}</a>
    </div>
  </article>`;
}

const matches = (c: CardData) => !search || `${c.name} ${c.username ?? ''}`.toLowerCase().includes(search);

function renderTargets(): CardData[] {
  const cards = targets.map((t): CardData => ({ ...t, kind: 'target', blurb: t.description ?? 'A NASA example to practise on.' })).filter(matches);
  el('targets-grid').innerHTML = cards.map(cardHtml).join('');
  return cards;
}

function renderDiscoveries(): CardData[] {
  const cards = discoveries.map((d): CardData => ({ ...d, username: d.discovered_by, kind: 'find', createdAt: d.discovered_at, blurb: timeAgo(d.discovered_at) })).filter(matches);
  el('finds-grid').innerHTML = cards.map(cardHtml).join('');
  return cards;
}

/** Groups claims by username, most claims first. */
function renderLeaderboard(): void {
  const counts = new Map<string, number>();
  for (const d of discoveries) counts.set(d.discovered_by, (counts.get(d.discovered_by) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  el('leaderboard').innerHTML = ranked.length
    ? ranked.map(([name, n], i) => `<li class="flex items-center justify-between py-2.5"><span class="flex items-center gap-3"><span class="grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${RANK_BADGES[i] ?? 'bg-slate-700 text-slate-200'}">#${i + 1}</span>@${escapeHtml(name)}</span><span class="text-sm">${n} ${n === 1 ? 'world' : 'worlds'}</span></li>`).join('')
    : '<li class="py-3 text-sm text-slate-400">No claims yet. Be the first!</li>';
}

function renderAll(): void {
  const t = renderTargets();
  const f = renderDiscoveries();
  el('n-targets').textContent = String(t.length);
  el('n-finds').textContent = String(f.length);
  el('n-all').textContent = String(t.length + f.length);
  el('claim-count').textContent = String(discoveries.length);
  const showT = filter !== 'finds' && t.length > 0;
  const showF = filter !== 'targets' && f.length > 0;
  el('targets').classList.toggle('hidden', !showT);
  el('finds').classList.toggle('hidden', !showF);
  el('empty').classList.toggle('hidden', showT || showF);
  renderLeaderboard();
  document.querySelectorAll<HTMLButtonElement>('.filter-pill').forEach((b) => {
    const on = b.dataset.filter === filter;
    b.setAttribute('aria-pressed', String(on));
    b.className = `filter-pill rounded-full px-4 py-1.5 text-sm font-semibold ${on ? 'bg-[#34d399] text-[#062118]' : 'border border-slate-600 hover:border-[#34d399] hover:text-[#34d399]'}`;
  });
}

/* ---------- Loading data (each request can fail on its own) ---------- */
async function loadData(): Promise<void> {
  const [t, d] = await Promise.allSettled([api.getTargets(), api.getDiscoveries()]);
  const status = el('status');
  if (t.status === 'fulfilled') targets = t.value;
  if (d.status === 'fulfilled') { discoveries = d.value; el('load-more').hidden = d.value.length < 50; }
  const failed = [t, d].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  status.classList.toggle('hidden', !failed);
  if (failed) status.innerHTML = `${escapeHtml((failed.reason as Error).message)} <button id="retry" type="button" class="ml-1 font-semibold text-[#34d399] underline">Try again</button>`;
  renderAll();
}

/* ---------- Dialogs ---------- */
const claimDialog = el<HTMLDialogElement>('claim-dialog');
const guideDialog = el<HTMLDialogElement>('guide-dialog');

function showMessage(box: HTMLElement, text: string, good = false): void {
  box.textContent = text;
  box.className = `rounded-xl px-3 py-2 text-sm ${good ? 'bg-[#34d399]/15 text-[#6ee7b7]' : 'bg-[#fb923c]/15 text-slate-100'}`;
}

function redirectClaim(): void {
  const params = new URLSearchParams({ claim: '1', ra: el<HTMLInputElement>('c-ra').value, dec: el<HTMLInputElement>('c-dec').value, name: el<HTMLInputElement>('c-name').value });
  location.assign(auth.signinUrl(`/catalog?${params}`));
}

function openClaim(ra?: string, dec?: string): void {
  el('claim-msg').className = 'hidden';
  if (ra) el<HTMLInputElement>('c-ra').value = ra;
  if (dec) el<HTMLInputElement>('c-dec').value = dec;
  if (!user) { redirectClaim(); return; }
  claimDialog.showModal();
}

/* ---------- Claiming a discovery ---------- */
async function handleClaimSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  const token = auth.getToken();
  if (!user || !token) { redirectClaim(); return; }

  const msg = el('claim-msg');
  const button = el<HTMLButtonElement>('claim-submit');
  button.disabled = true;
  try {
    const name = el<HTMLInputElement>('c-name').value.trim();
    const created = await api.createDiscovery(token, { name, ra: Number(el<HTMLInputElement>('c-ra').value), dec: Number(el<HTMLInputElement>('c-dec').value) });
    discoveries = [created, ...discoveries]; // show it straight away, no reload needed
    renderAll();
    (e.target as HTMLFormElement).reset();
    showMessage(msg, `You did it! “${name}” is now yours.`, true);
  } catch (err) {
    const status = err instanceof api.ApiError ? err.status : 0;
    if (status === 401) { user = null; redirectClaim(); }
    else if (status === 409) showMessage(msg, 'Someone got there first! Another discovery is already within 1 arcsecond of this spot. Try a different position.');
    else showMessage(msg, (err as Error).message);
  } finally {
    button.disabled = false;
  }
}

/* ---------- Sky guide (text steps for now) ---------- */
const GUIDE = [
  'Step 1: pick a target. Barnard’s Star is a good first one because it moves faster than any other star.',
  'Step 2: press “Open in Explorer” and zoom in until it shows as a dot.',
  'Step 3: choose an observation and detector band to see its image.',
  'Step 4: found a new spot? Press “Claim a discovery” and add its RA and Dec.',
];
let guideStep = 0;
function showGuideStep(): void {
  el('guide-step').textContent = `(${guideStep + 1} of ${GUIDE.length})`;
  el('guide-text').textContent = GUIDE[guideStep];
  el('guide-next').textContent = guideStep === GUIDE.length - 1 ? 'Done' : 'Next';
  el<HTMLButtonElement>('guide-prev').disabled = guideStep === 0;
}

/* ---------- Wiring it all up ---------- */
function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('.filter-pill').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter as Filter; renderAll(); }));
  el<HTMLInputElement>('search').addEventListener('input', (e) => { search = (e.target as HTMLInputElement).value.trim().toLowerCase(); renderAll(); });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'retry') void loadData();
    if (t.closest('[data-open-claim]')) openClaim();
    if (t.closest('[data-close]')) t.closest('dialog')?.close();
    if (t instanceof HTMLDialogElement) t.close(); // click on the dark backdrop
  });
  el('claim-form').addEventListener('submit', (e) => void handleClaimSubmit(e as SubmitEvent));

  el('guide-btn').addEventListener('click', () => { guideStep = 0; showGuideStep(); guideDialog.showModal(); });
  el('guide-prev').addEventListener('click', () => { guideStep--; showGuideStep(); });
  el('guide-next').addEventListener('click', () => { if (guideStep === GUIDE.length - 1) guideDialog.close(); else { guideStep++; showGuideStep(); } });
}

async function init(): Promise<void> {
  bindEvents();
  el('load-more').onclick = async () => {
    const button = el<HTMLButtonElement>('load-more');
    button.disabled = true;
    try {
      const page = await api.getDiscoveries(discoveries.length);
      const known = new Set(discoveries.map((d) => d.id));
      discoveries.push(...page.filter((d) => !known.has(d.id)));
      button.hidden = page.length < 50;
      renderAll();
    } catch (error) { showMessage(el('status'), (error as Error).message); }
    finally { button.disabled = false; }
  };
  renderAll(); // draws the empty shell straight away
  const [, currentUser] = await Promise.all([loadData(), auth.initSessionUI((value) => { user = value; })]);
  user = currentUser;
  window.setInterval(async () => {
    if (document.hidden || !discoveries.some((d) => !d.classification || d.classification.error)) return;
    try {
      const refreshed: api.Discovery[] = [];
      for (let offset = 0; offset < discoveries.length; offset += 100) {
        refreshed.push(...await api.getDiscoveries(offset, 100));
      }
      const byId = new Map(refreshed.map((d) => [d.id, d]));
      discoveries = discoveries.map((d) => byId.get(d.id) ?? d);
      renderAll();
    } catch { /* The next poll retries without interrupting a claim. */ }
  }, 15000);

  // Links like /catalog?ra=252.88&dec=-35.33 open the claim form pre-filled.
  const params = new URLSearchParams(location.search);
  const ra = params.get('ra'), dec = params.get('dec');
  el<HTMLInputElement>('c-name').value = params.get('name') ?? '';
  if (params.has('claim')) openClaim(ra ?? undefined, dec ?? undefined);
  else if (ra !== null && dec !== null && !Number.isNaN(Number(ra)) && !Number.isNaN(Number(dec))) openClaim(ra, dec);
}

void init();
