/**
 * Which market (symbol) the Dtrader chart is showing. Dtrader writes it into the page address (?symbol=...) every time the market
 * changes; the site hides that long address, but passes it here first, so this always holds the chart's current market.
 */
let current = '';
const listeners = new Set<(s: string) => void>();

export function noteDtraderUrl(url?: string | URL | null): void {
  if (!url) return;
  const m = String(url).match(/[?&]symbol=([^&#]+)/);
  if (!m) return;
  const next = decodeURIComponent(m[1]);
  if (next && next !== current) {
    current = next;
    listeners.forEach(l => l(current));
  }
}
export function getDtraderSymbol(): string {
  // Dtrader keeps its chosen market in its own saved state; read it live, fall back to the URL capture
  try {
    const saved = JSON.parse(sessionStorage.getItem('trade_store') || '{}')?.symbol;
    if (typeof saved === 'string' && saved) return saved;
  } catch {
    /* ignore */
  }
  return current;
}
export function onDtraderSymbol(l: (s: string) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Market of the Charts tab (set by the Charts page itself). */
let charts = '';
export const getChartsSymbol = () => charts;
export const setChartsSymbol = (s: string) => {
  charts = s;
};

/** The market the circles on screen should follow right now (picked by the overlay for whichever chart it sits on). */
let shown = '';
const shownListeners = new Set<(s: string) => void>();
export const getShownSymbol = () => shown;
export function setShownSymbol(s: string): void {
  if (s === shown) return;
  shown = s;
  shownListeners.forEach(l => l(shown));
}
export function onShownSymbol(l: (s: string) => void): () => void {
  shownListeners.add(l);
  return () => shownListeners.delete(l);
}
