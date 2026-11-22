/**
 * Live last-digit circles on the Dtrader chart: a small row sitting on the same level as the chart's zoom buttons, just to the right
 * of the "+", with no background so the chart shows through. It appears on the digit contract types only (Matches/Differs,
 * Over/Under, Even/Odd) and follows whichever market the chart is showing.
 */
import './digit-overlay.css';
import { createElement } from 'react';
import { getChartsSymbol, getDtraderSymbol, setShownSymbol } from './dtrader-symbol';
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
    // find the zoom "+" of the chart that is actually on screen: the Dtrader chart (digit types only) or the Charts tab chart
    let plus: HTMLElement | null = null;
    let symbol = '';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.cq-zoom-in'))) {
      if (el.getBoundingClientRect().width === 0) continue;
      if (el.closest('.derivatives-trader')) {
        const chip = document.querySelector('.derivatives-trader .trade__trade-types button[data-state="selected"]');
        if (document.body.classList.contains('epm-dtrader-active') && chip && DIGIT_TYPES.test(chip.textContent || '')) {
          plus = el;
          symbol = getDtraderSymbol();
          break;
        }
      } else if (getChartsSymbol()) {
        plus = el;
        symbol = getChartsSymbol();
        break;
      }
    }
    if (!plus || !symbol) {
      host.style.display = 'none';
      return;
    }
    setShownSymbol(symbol);
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
