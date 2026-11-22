/**
 * Live last-digit circles on the Dtrader chart: a small row sitting on the same level as the chart's zoom buttons, just to the right
 * of the "+", with no background so the chart shows through. It appears on every contract type, in Manual and in Auto, and follows whichever market the chart is showing.
 */
import './digit-overlay.css';
import { createElement } from 'react';
import { getChartsSymbol, getDtraderSymbol, setShownSymbol } from './dtrader-symbol';
import { createRoot } from 'react-dom/client';

// the chart's zoom buttons (Dtrader's chart and the Charts tab chart name them a little differently)
const PLUS = ".cq-zoom-in, [class*='zoom-in' i], [aria-label*='zoom in' i], [title*='zoom in' i]";
const MINUS = ".cq-zoom-out, [class*='zoom-out' i], [aria-label*='zoom out' i], [title*='zoom out' i]";
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
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(PLUS))) {
      if (el.getBoundingClientRect().width === 0) continue;
      if (el.closest('.derivatives-trader')) {
        if (document.body.classList.contains('epm-dtrader-active')) {
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
    // move the zoom buttons (- o +) two button-widths to the left, to make room for the circles
    let group: HTMLElement | null = plus.parentElement;
    for (let i = 0; i < 3 && group && !group.querySelector(MINUS); i++) group = group.parentElement;
    if (group && group.querySelector(MINUS)) {
      const w = plus.getBoundingClientRect().width;
      group.style.transform = `translateX(${-Math.round(2 * (w + 10))}px)`;
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
