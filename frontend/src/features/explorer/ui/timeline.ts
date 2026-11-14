// path: src/features/explorer/ui/timeline.ts
export function mountTimeline(
  root: HTMLElement,
  epochs: string[],
  onChange: (i: number) => void,
) {
  const last = epochs.length - 1;
  let pos = 0; // float position, 0..last
  let idx = -1;
  let fps = 2; // epochs per second
  let raf = 0;
  let playing = false;

  root.innerHTML = `
    <div class="mb-2 flex items-end justify-between">
      <div>
        <h2 class="font-semibold text-white">Time-lapse timeline</h2>
        <p id="date" class="text-xs text-slate-400"></p>
      </div>
      <label class="flex items-center gap-2 text-xs text-slate-400">
        <span id="fps-val" class="w-10 text-right tabular-nums">2 fps</span>
        <input id="fps" type="range" min="1" max="5" value="2" style="--p:25%" class="smooth w-28">
      </label>
    </div>

    <input id="scrub" type="range" min="0" max="${last * 1000}" step="1" value="0" class="smooth w-full">

    <div class="mt-3 flex items-center justify-between text-sm text-slate-400">
      <span>${epochs[0]}</span>
      <div class="flex items-center gap-4 text-lg">
        <button id="prev" class="rounded-2xl border border-slate-700 px-6 py-3 text-slate-100 transition-colors hover:border-emerald-400 hover:text-emerald-400 active:scale-95">Previous</button>
        <button id="play" class="w-36 rounded-2xl bg-emerald-400 py-3 font-semibold text-slate-950 transition-colors hover:bg-emerald-300 active:scale-95">Play</button>
        <button id="next" class="rounded-2xl border border-slate-700 px-6 py-3 text-slate-100 transition-colors hover:border-emerald-400 hover:text-emerald-400 active:scale-95">Next</button>
      </div>
      <span>${epochs[last]}</span>
    </div>`;

  const $ = (id: string) => root.querySelector<HTMLInputElement>('#' + id)!;

  const render = () => {
    $('scrub').value = String(pos * 1000);
    $('scrub').style.setProperty('--p', `${(pos / Math.max(last, 1)) * 100}%`);
    const i = Math.round(pos);
    if (i !== idx) {
      idx = i;
      $('date').textContent = `Observation epoch: ${epochs[i]}`;
      onChange(i);
    }
  };

  // Ease to a target position
  const tween = (to: number, ms = 300) => {
    cancelAnimationFrame(raf);
    const from = pos;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min((t - t0) / ms, 1);
      pos = from + (to - from) * (1 - (1 - k) ** 3);
      render();
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const stop = (settle = true) => {
    cancelAnimationFrame(raf);
    playing = false;
    $('play').textContent = 'Play';
    if (settle) tween(Math.round(pos), 200);
  };

  const play = () => {
    cancelAnimationFrame(raf);
    playing = true;
    $('play').textContent = 'Pause';
    let prev = performance.now();
    const tick = (t: number) => {
      pos += ((t - prev) / 1000) * fps;
      prev = t;
      if (pos > last) pos = 0;
      render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const step = (d: number) => {
    stop(false);
    tween(Math.min(Math.max(Math.round(pos) + d, 0), last));
  };

  $('play').onclick = () => (playing ? stop() : play());
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);

  $('scrub').oninput = () => {
    stop(false);
    pos = +$('scrub').value / 1000;
    render();
  };
  $('scrub').onchange = () => tween(Math.round(pos), 200);

  $('fps').oninput = () => {
    fps = +$('fps').value;
    $('fps-val').textContent = `${fps} fps`;
    $('fps').style.setProperty('--p', `${((fps - 1) / 4) * 100}%`);
  };

  render();
}