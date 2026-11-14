// path: src/features/explorer/ui/spectra.ts
import Chart from 'chart.js/auto';

Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;

// Mock spectrum: 102 points, 0.75–5.0 µm, dips near 3.0 and 4.26 µm
const mock = Array.from({ length: 102 }, (_, n) => {
  const x = 0.75 * Math.pow(5 / 0.75, n / 101);
  const dip = (c: number, w: number, d: number) => 1 - d * Math.exp(-(((x - c) / w) ** 2));
  return { x, y: (100 / x) * dip(3.0, 0.15, 0.6) * dip(4.26, 0.1, 0.5) };
});

export function mountSpectra(root: HTMLElement) {
  root.innerHTML = `
    <div class="relative h-44 rounded-2xl border border-slate-800 bg-slate-950/90 p-3">
      <canvas></canvas>
    </div>`;

  new Chart(root.querySelector('canvas')!, {
    type: 'line',
    data: {
      datasets: [{ data: mock, borderColor: '#34d399', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'logarithmic',
          min: 0.75,
          max: 5,
          grid: { display: false },
          border: { display: false },
          ticks: { callback: (v) => ([1, 2, 3, 4, 5].includes(+v) ? v : '') },
          title: { display: true, text: 'Wavelength (µm)' },
        },
        y: {
          type: 'logarithmic',
          grid: { color: '#1e293b' },
          border: { display: false },
          ticks: { display: false },
        },
      },
    },
  });
}