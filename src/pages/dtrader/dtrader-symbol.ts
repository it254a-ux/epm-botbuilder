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
export const getDtraderSymbol = () => current;
export function onDtraderSymbol(l: (s: string) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
