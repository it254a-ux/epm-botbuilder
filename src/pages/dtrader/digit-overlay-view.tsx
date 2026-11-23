import { Component, useEffect, useState, type ReactNode } from 'react';
import { useDerivWS } from '@deriv/core';
import DigitStatsWidget from '@/pages/epm-analysis-tool/digit-stats-widget';
import { useEpmTickStore } from '@/pages/epm-analysis-tool/use-epm-tick-stats';
import { getShownSymbol, onShownSymbol } from './dtrader-symbol';

/**
 * Last digit of the price the chart itself is showing in its "current price" tag, so the circles always match the chart.
 * The tag is found by its text (a price) and by being the price closest to our latest tick, which skips the axis labels
 * and the crosshair tag.
 */
let tagEl: HTMLElement | null = null;
const PRICE = /^\d[\d,]*\.(\d+)$/;
function chartDigit(lastQuote: number): number {
  const read = (el: HTMLElement) => {
    const m = (el.textContent || '').trim().match(PRICE);
    return m ? { digit: Number(m[1].slice(-1)), value: Number((el.textContent || '').replace(/,/g, '')) } : null;
  };
  if (tagEl && tagEl.isConnected && tagEl.getBoundingClientRect().width > 0) {
    const r = read(tagEl);
    if (r && (!lastQuote || Math.abs(r.value - lastQuote) < Math.max(1, lastQuote * 0.0005))) return r.digit;
  }
  tagEl = null;
  let best: { el: HTMLElement; digit: number; diff: number } | null = null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('div,span,p'))) {
    if (el.children.length || el.closest('.epm-digit-overlay')) continue;
    const t = el.textContent || '';
    if (t.length < 5 || t.length > 12) continue;
    const r = read(el);
    if (!r || el.getBoundingClientRect().width === 0) continue;
    const bg = getComputedStyle(el).backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    const diff = lastQuote ? Math.abs(r.value - lastQuote) : 0;
    if (!best || diff < best.diff) best = { el, digit: r.digit, diff };
  }
  if (!best || (lastQuote && best.diff > Math.max(1, lastQuote * 0.0005))) return -1;
  tagEl = best.el;
  return best.digit;
}

/** The live last-digit circles: follows the market on the Dtrader chart and redraws on every tick. */
export default function DigitOverlay() {
  const [symbol, setSymbol] = useState(getShownSymbol());
  useEffect(() => onShownSymbol(setSymbol), []);
  const { ws, isConnected } = useDerivWS();
  const store = useEpmTickStore(ws, isConnected, symbol);
  const [fromChart, setFromChart] = useState(-1);
  useEffect(() => {
    const id = window.setInterval(() => setFromChart(chartDigit(store.getSnapshot().ticks.slice(-1)[0]?.quote ?? 0)), 100);
    return () => window.clearInterval(id);
  }, [store]);
  if (!symbol) return null;
  return <DigitStatsWidget store={store} singleRow currentDigitOverride={fromChart} />;
}

/** If anything inside the circles breaks, show a short note instead of failing silently. */
class Guard extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error) return <div style={{ color: '#ff6b6b', fontSize: 11 }}>digits error: {this.state.error}</div>;
    return this.props.children;
  }
}

export function DigitOverlayGuarded() {
  return (
    <Guard>
      <DigitOverlay />
    </Guard>
  );
}
