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
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3">

      <div class="flex items-center gap-2">
        <button id="prev" class="btn px-5 py-2.5 text-base">← Back</button>
        <button id="play" class="btn w-28 border-emerald-400 bg-emerald-400 py-2.5 text-base text-slate-950 hover:bg-emerald-300 hover:text-slate-950">▶ Play</button>
        <button id="next" class="btn px-5 py-2.5 text-base">Next →</button>
      </div>

      <div class="min-w-56 flex-1">
        <input id="scrub" type="range" min="0" max="${last * 1000}" step="1" value="0" class="smooth w-full">
        <div class="flex justify-between text-[11px] text-slate-500">
          <span>${epochs[0]}</span><span>${epochs[last]}</span>
        </div>
      </div>

      <span id="date" class="rounded-md bg-emerald-400/15 px-2 py-1 text-xs font-medium tabular-nums text-emerald-300"></span>

      <label class="flex items-center gap-2 text-xs text-slate-400">
        <span id="fps-val" class="w-10 text-right tabular-nums">2 fps</span>
        <input id="fps" type="range" min="1" max="5" value="2" style="--p:25%" class="smooth w-24">
      </label>
    </div>`;

  const $ = (id: string) => root.querySelector<HTMLInputElement>('#' + id)!;

  const render = () => {
    $('scrub').value = String(pos * 1000);
    $('scrub').style.setProperty('--p', `${(pos / Math.max(last, 1)) * 100}%`);
    const i = Math.round(pos);
    if (i !== idx) {
      idx = i;
      $('date').textContent = epochs[i];
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
    $('play').textContent = '▶ Play';
    if (settle) tween(Math.round(pos), 200);
  };

  const play = () => {
    cancelAnimationFrame(raf);
    playing = true;
    $('play').textContent = '⏸ Pause';
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