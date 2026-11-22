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

const COLUMN = '.derivatives-trader .trade-params';
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

/**
 * Keeps the trading column (Duration / Stake / Buy, or the bots view) exactly as tall as the visible screen, so only that
 * column scrolls, not the whole page. In Auto the column is fixed to the screen height (the bots view fills it and scrolls
 * inside itself); in Manual it grows with its content up to the screen height and then scrolls.
 */
function fitPane() {
  const col = document.querySelector(COLUMN) as HTMLElement | null;
  if (!col || !document.body.classList.contains('epm-dtrader-active')) return;
  if (col.getBoundingClientRect().width === 0) return;
  holdPageStill();
  if (pane && mode === 'manual') sampleManual(pane);
  const room = Math.max(240, Math.round(window.innerHeight - col.getBoundingClientRect().top - 8));
  col.style.maxHeight = `${room}px`;
  if (mode === 'auto') {
    col.style.height = `${room}px`;
    col.style.overflowY = 'hidden';
  } else {
    col.style.height = '';
    col.style.overflowY = 'auto';
  }
}

function paint() {
  document.querySelectorAll(`.${BAR_CLASS} .epm-mode__btn`).forEach(el => {
    el.classList.toggle('is-on', (el as HTMLElement).dataset.mode === mode);
  });
}

function ensurePane(): HTMLElement | null {
  if (pane && pane.isConnected && pane.parentElement?.matches(COLUMN)) return pane;
  const root = document.querySelector(COLUMN) as HTMLElement | null;
  if (!root) return null;
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  if (pane) {
    root.appendChild(pane); // Deriv rebuilt its column: move the bots view into the new one (the bots keep running)
    return pane;
  }
  pane = document.createElement('div');
  pane.id = PANE_ID;
  const head = makeBar();
  head.classList.add('epm-mode--pane');
  const body = document.createElement('div');
  body.className = 'epm-auto-pane__body';
  pane.append(head, body);
  root.appendChild(pane);
  return pane;
}

function setMode(next: 'manual' | 'auto') {
  mode = next;
  if (next === 'auto') {
    const p = ensurePane();
    if (!p) return;
    sampleManual(p);
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
  fitPane();
  paint();
}

function ensureBar() {
  const link = document.querySelector('.derivatives-trader .guide-link') as HTMLElement | null;
  if (!link || !link.parentElement) return;
  if (link.previousElementSibling?.classList.contains(BAR_CLASS)) return;
  link.parentElement.insertBefore(makeBar(), link);
  paint();
  fitPane();
}

/**
 * Copies the real Manual look onto the bots view: it reads the live Duration / Stake fields (text sizes, weights, colours, box
 * colour, corners, height) and the column's side margins, and hands them to the bots view as CSS variables, so Auto is the same
 * as Manual instead of an imitation of it.
 */
function leaf(root: Element, re: RegExp): HTMLElement | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (re.test((n.nodeValue || '').trim()) && n.parentElement && n.parentElement.getBoundingClientRect().width > 0) return n.parentElement;
  }
  return null;
}
function boxOf(el: HTMLElement, stop: Element): HTMLElement {
  let best = el;
  for (let n: HTMLElement | null = el; n && n !== stop; n = n.parentElement) {
    const c = getComputedStyle(n);
    if (c.backgroundColor && c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent') return n;
    best = n;
  }
  return best;
}
function sampleManual(pane: HTMLElement) {
  const col = document.querySelector(COLUMN) as HTMLElement | null;
  if (!col || col.getBoundingClientRect().width === 0) return;
  const label = leaf(col, /^Duration$/) || leaf(col, /^Stake$/);
  const value = leaf(col, /^\d+\s*(tick|ticks|seconds|minutes)$/i) || leaf(col, /^[\d.]+\s*USD$/);
  const bar = col.querySelector('.epm-mode:not(.epm-mode--pane)') as HTMLElement | null;
  const set = (k: string, v: string) => v && pane.style.setProperty(k, v);
  if (label) {
    const c = getComputedStyle(label);
    set('--epm-fs-label', c.fontSize);
    set('--epm-fw-label', c.fontWeight);
    set('--epm-col-label', c.color);
    set('--epm-lh-label', c.lineHeight);
    const box = boxOf(label, col);
    const b = getComputedStyle(box);
    set('--epm-box-bg', b.backgroundColor);
    set('--epm-box-radius', b.borderRadius);
    set('--epm-box-h', `${Math.round(box.getBoundingClientRect().height)}px`);
    set('--epm-pad-x', `${Math.round(label.getBoundingClientRect().left - box.getBoundingClientRect().left)}px`);
  }
  if (value) {
    const c = getComputedStyle(value);
    set('--epm-fs-val', c.fontSize);
    set('--epm-fw-val', c.fontWeight);
    set('--epm-col-val', c.color);
    set('--epm-lh-val', c.lineHeight);
  }
  const ref = bar || (label ? boxOf(label, col) : null);
  if (ref) {
    const r = ref.getBoundingClientRect();
    const cr = col.getBoundingClientRect();
    set('--epm-pad-l', `${Math.max(0, Math.round(r.left - cr.left))}px`);
    set('--epm-pad-r', `${Math.max(0, Math.round(cr.right - r.right))}px`);
  }
}

/**
 * Everything around the trading column is made unscrollable ("clip" cannot be scrolled by anything, not even by a field being
 * focused), so the page cannot shift when the bots view opens. It is undone again when Dtrader is not the page being looked at.
 */
const clipped = new Set<HTMLElement>();
function lockAncestors(on: boolean) {
  if (!on) {
    clipped.forEach(el => el.style.removeProperty('overflow'));
    clipped.clear();
    return;
  }
  const col = document.querySelector(COLUMN) as HTMLElement | null;
  if (!col) return;
  for (let el: HTMLElement | null = col.parentElement; el; el = el.parentElement) {
    if (clipped.has(el)) continue;
    const o = getComputedStyle(el).overflow;
    if (o.includes('auto') || o.includes('scroll') || o.includes('hidden') || el === document.body || el === document.documentElement) {
      el.style.setProperty('overflow', 'clip', 'important');
      clipped.add(el);
    }
  }
}

/** On a computer the Dtrader tab never scrolls as a page: anything that got scrolled around the trading column is put back at the top. */
function holdPageStill(e?: Event) {
  if (!document.body.classList.contains('epm-dtrader-active') || window.innerWidth < 1024) {
    lockAncestors(false);
    return;
  }
  lockAncestors(true);
  const col = document.querySelector(COLUMN) as HTMLElement | null;
  if (!col || col.getBoundingClientRect().width === 0) return;
  const target = e?.target;
  if (target instanceof Element) {
    if (target.contains(col) && target.scrollTop > 0) target.scrollTop = 0;
    return;
  }
  for (let el: HTMLElement | null = col.parentElement; el; el = el.parentElement) {
    if (el.scrollTop > 0) el.scrollTop = 0;
  }
  if (window.scrollY > 0) window.scrollTo(0, 0);
}

export function startAutoSwitch(): void {
  if (started) return;
  started = true;
  // load the bots screen in the background so the first press of Auto opens instantly
  window.setTimeout(() => void import('./classic-bots').catch(() => undefined), 4000);
  document.addEventListener('scroll', e => (e.target === document ? holdPageStill() : holdPageStill(e)), true);
  window.addEventListener('resize', fitPane);
  window.setInterval(fitPane, 1500);
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
