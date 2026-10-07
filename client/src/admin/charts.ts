import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const live = new WeakMap<HTMLCanvasElement, Chart>();

/** Horizontal bar chart of percentages (0-1). Re-rendering replaces the old chart. */
export function percentBars(canvas: HTMLCanvasElement, labels: string[], values: number[], color: string) {
  live.get(canvas)?.destroy();
  live.set(
    canvas,
    new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: values.map((v) => Math.round(v * 100)), backgroundColor: color, borderRadius: 4 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { tooltip: { callbacks: { label: (c) => `${c.parsed.x}%` } } },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, color: '#9ca3af' }, grid: { color: '#374151' } },
          y: { ticks: { color: '#e5e7eb' }, grid: { display: false } },
        },
      },
    }),
  );
}
