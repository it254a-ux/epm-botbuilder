/** Small, pure helpers for the Market Forecast page (kept apart from the screen so they can be tested). */

export interface Bar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface PathCandle {
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
}

export interface ForecastResult {
    step: number;
    last_close: number;
    paths: PathCandle[][];
    median_close: number[];
    p10_close: number[];
    p90_close: number[];
    up_share: number;
    levels?: { tp_first: number; sl_first: number; neither: number };
}

const median = (values: number[]): number => {
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** One "typical" candle per step: the middle value of every sample path, kept a valid candle (wicks contain the body). */
export function medianBars(paths: PathCandle[][]): Bar[] {
    if (!paths.length || !paths[0].length) return [];
    return paths[0].map((first, i) => {
        const at = paths.map(p => p[i]).filter(Boolean);
        const open = median(at.map(c => c.o));
        const close = median(at.map(c => c.c));
        const high = Math.max(median(at.map(c => c.h)), open, close);
        const low = Math.min(median(at.map(c => c.l)), open, close);
        return { time: first.t, open, high, low, close };
    });
}

/** Number of decimals a price is written with (at most 5), so results line up with the chart's prices. */
export function decimalsOf(price: number): number {
    const s = String(price);
    const dot = s.indexOf('.');
    return dot < 0 ? 0 : Math.min(5, s.length - dot - 1);
}

export type Lean = 'up' | 'down' | 'none';

/** With only a handful of sample paths, only a clear majority counts as a lean. */
export function leanOf(upShare: number): Lean {
    if (upShare >= 0.7) return 'up';
    if (upShare <= 0.3) return 'down';
    return 'none';
}

/** Parses the TP / SL boxes. Returns an error text, or the levels (or null when no side is chosen). */
export function readLevels(
    side: 'none' | 'buy' | 'sell',
    tpText: string,
    slText: string
): { error: string } | { levels: { side: 'buy' | 'sell'; tp: number; sl: number } | null } {
    if (side === 'none') return { levels: null };
    const tp = Number(tpText.replace(',', '.'));
    const sl = Number(slText.replace(',', '.'));
    if (!tpText.trim() || !slText.trim() || !Number.isFinite(tp) || !Number.isFinite(sl)) {
        return { error: 'Type both a take profit and a stop loss price, or choose "No trade".' };
    }
    if (side === 'buy' && !(tp > sl)) return { error: 'For a buy, the take profit must be above the stop loss.' };
    if (side === 'sell' && !(tp < sl)) return { error: 'For a sell, the take profit must be below the stop loss.' };
    return { levels: { side, tp, sl } };
}

/** Drops the candle that is still forming, so the model only sees closed candles. */
export function closedOnly(bars: Bar[], stepSec: number, nowSec: number): Bar[] {
    return bars.filter(b => b.time + stepSec <= nowSec);
}
