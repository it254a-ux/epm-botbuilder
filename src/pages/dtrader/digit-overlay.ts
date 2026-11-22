/**
 * Live last-digit circles on the Dtrader chart: a small row sitting on the same level as the chart's zoom buttons, just to the right
 * of the "+", with no background so the chart shows through. It appears on the digit contract types only (Matches/Differs,
 * Over/Under, Even/Odd) and follows whichever market the chart is showing.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

const DIGIT_TYPES = /matches|differs|over|under|even|odd/i;
let started = false;

export function startDigitOverlay(): void {
  if (started) return;
  started = true;
  const host = document.createElement('div');
  host.className = 'epm-digit-overlay';
  host.style.display = 'none';
  document.body.appendChild(host);
  let mounted = false;

  const place = () => {
    const plus = document.querySelector('.derivatives-trader .cq-zoom-in') as HTMLElement | null;
    const chip = document.querySelector('.derivatives-trader .trade__trade-types button[data-state="selected"]');
    const show =
      document.body.classList.contains('epm-dtrader-active') && !!plus && !!chip && DIGIT_TYPES.test(chip.textContent || '');
    if (!show || !plus) {
      host.style.display = 'none';
      return;
    }
    const r = plus.getBoundingClientRect();
    if (r.width === 0) {
      host.style.display = 'none';
      return;
    }
    const chart = plus.closest('.sc-chart, .smartcharts, .ciq-chart-area, .chart-container') as HTMLElement | null;
    const right = chart ? chart.getBoundingClientRect().right : window.innerWidth;
    const left = r.right + 12;
    const width = Math.max(0, Math.min(400, right - left - 80));
    if (width < 220) {
      host.style.display = 'none';
      return;
    }
    host.style.display = 'block';
    host.style.width = `${width}px`;
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(r.top + r.height / 2 - host.offsetHeight / 2)}px`;
    if (!mounted) {
      mounted = true;
      void import('./digit-overlay').then(m => createRoot(host).render(createElement(m.default)));
    }
  };
  window.setInterval(place, 250);
}
