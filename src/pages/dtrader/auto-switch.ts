/**
 * Manual / Auto switch for the Dtrader tab.
 *
 * Adds a small two-button row (Manual | Auto) just above Deriv's "How to trade ...?" link. "Manual" is the normal Dtrader screen,
 * untouched. "Auto" lays the old Dtrader's automated bots (Rise/Fall, Digits, Accumulators) over the Dtrader screen. The bots
 * screen is built once, the first time Auto is pressed, and then only hidden when you go back to Manual, so a running bot keeps
 * running while you watch the chart.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

const ROOT_ID = 'derivatives_trader';
const BAR_CLASS = 'epm-mode';
const PANE_ID = 'epm-auto-pane';

let started = false;
let mode: 'manual' | 'auto' = 'manual';
let pane: HTMLElement | null = null;
let mounted = false;

const BOT_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4.5M9.5 4.5h5"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor"/><path d="M9.5 16.5h5"/></svg>';
const HAND_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18V9m5 9V6m5 12V8m5 10V11"/><path d="M3 20h18"/></svg>';

function makeBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = BAR_CLASS;
  bar.innerHTML =
    `<button type="button" data-mode="manual" class="epm-mode__btn">${HAND_ICON}<span>Manual</span></button>` +
    `<button type="button" data-mode="auto" class="epm-mode__btn" title="Automation (bots)">${BOT_ICON}<span>Auto</span></button>`;
  bar.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-mode]') as HTMLElement | null;
    if (b) setMode(b.dataset.mode === 'auto' ? 'auto' : 'manual');
  });
  return bar;
}

function paint() {
  document.querySelectorAll(`.${BAR_CLASS} .epm-mode__btn`).forEach(el => {
    el.classList.toggle('is-on', (el as HTMLElement).dataset.mode === mode);
  });
}

function ensurePane(): HTMLElement | null {
  if (pane && pane.isConnected) return pane;
  const root = document.getElementById(ROOT_ID);
  if (!root) return null;
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  pane = document.createElement('div');
  pane.id = PANE_ID;
  const head = makeBar();
  head.classList.add('epm-mode--pane');
  const body = document.createElement('div');
  body.className = 'epm-auto-pane__body';
  pane.append(head, body);
  root.appendChild(pane);
  mounted = false;
  return pane;
}

function setMode(next: 'manual' | 'auto') {
  mode = next;
  if (next === 'auto') {
    const p = ensurePane();
    if (!p) return;
    p.style.display = 'flex';
    if (!mounted) {
      mounted = true;
      const body = p.querySelector('.epm-auto-pane__body') as HTMLElement;
      body.innerHTML = '<div class="epm-auto-pane__load">Loading bots&hellip;</div>';
      void import('./classic-bots')
        .then(m => {
          body.innerHTML = '';
          createRoot(body).render(createElement(m.default));
        })
        .catch(() => {
          mounted = false;
          body.innerHTML = '<div class="epm-auto-pane__load">Could not load the bots. Press Auto again.</div>';
        });
    }
  } else if (pane) {
    pane.style.display = 'none';
  }
  paint();
}

function ensureBar() {
  const link = document.querySelector('.derivatives-trader .guide-link') as HTMLElement | null;
  if (!link || !link.parentElement) return;
  if (link.previousElementSibling?.classList.contains(BAR_CLASS)) return;
  link.parentElement.insertBefore(makeBar(), link);
  paint();
}

export function startAutoSwitch(): void {
  if (started) return;
  started = true;
  let queued = false;
  const run = () => {
    queued = false;
    ensureBar();
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
