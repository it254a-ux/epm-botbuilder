/**
 * Chart indicators and candle styles for the Forex Trader / Forex Live charts.
 * Plain number crunching with no chart code in it, so every formula can be tested on its own.
 * Each indicator returns one value per candle, or null while there is not enough history yet.
 */
import type { Candle } from './engine';

export type Series = (number | null)[];

/** Simple moving average of the closes. */
export function sma(candles: Candle[], period: number): Series {
    const out: Series = [];
    let sum = 0;
    candles.forEach((c, i) => {
        sum += c.close;
        if (i >= period) sum -= candles[i - period].close;
        out.push(i >= period - 1 ? sum / period : null);
    });
    return out;
}

/** Exponential moving average of the closes (starts from the simple average of the first `period` closes). */
export function ema(candles: Candle[], period: number): Series {
    return emaOf(
        candles.map(c => c.close),
        period
    );
}

function emaOf(values: (number | null)[], period: number): Series {
    const k = 2 / (period + 1);
    const out: Series = [];
    let prev: number | null = null;
    let seed: number[] = [];
    values.forEach(v => {
        if (v === null) {
            out.push(null);
            return;
        }
        if (prev === null) {
            seed.push(v);
            if (seed.length === period) {
                prev = seed.reduce((a, b) => a + b, 0) / period;
                out.push(prev);
                seed = [];
            } else out.push(null);
            return;
        }
        prev = v * k + prev * (1 - k);
        out.push(prev);
    });
    return out;
}

/** Bollinger bands: the middle is the simple average, the bands sit `mult` standard deviations away. */
export function bollinger(candles: Candle[], period = 20, mult = 2): { mid: Series; upper: Series; lower: Series } {
    const mid = sma(candles, period);
    const upper: Series = [];
    const lower: Series = [];
    candles.forEach((_, i) => {
        const m = mid[i];
        if (m === null) {
            upper.push(null);
            lower.push(null);
            return;
        }
        let sq = 0;
        for (let j = i - period + 1; j <= i; j += 1) sq += (candles[j].close - m) ** 2;
        const sd = Math.sqrt(sq / period);
        upper.push(m + mult * sd);
        lower.push(m - mult * sd);
    });
    return { mid, upper, lower };
}

/** Relative Strength Index (Wilder's smoothing), 0 to 100. */
export function rsi(candles: Candle[], period = 14): Series {
    const out: Series = candles.map(() => null);
    if (candles.length <= period) return out;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i += 1) {
        const d = candles[i].close - candles[i - 1].close;
        if (d >= 0) gain += d;
        else loss -= d;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    const value = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    out[period] = value();
    for (let i = period + 1; i < candles.length; i += 1) {
        const d = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
        out[i] = value();
    }
    return out;
}

/** Highest high and lowest low of the last `period` candles (Donchian channel). */
export function donchian(candles: Candle[], period = 20): { upper: Series; lower: Series } {
    const upper: Series = candles.map(() => null);
    const lower: Series = candles.map(() => null);
    for (let i = period - 1; i < candles.length; i += 1) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j += 1) {
            hi = Math.max(hi, candles[j].high);
            lo = Math.min(lo, candles[j].low);
        }
        upper[i] = hi;
        lower[i] = lo;
    }
    return { upper, lower };
}

/** Average true range (Wilder smoothing). */
export function atr(candles: Candle[], period = 14): Series {
    const out: Series = candles.map(() => null);
    if (candles.length <= period) return out;
    const tr = (i: number) =>
        Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
    let sum = 0;
    for (let i = 1; i <= period; i += 1) sum += tr(i);
    let prev = sum / period;
    out[period] = prev;
    for (let i = period + 1; i < candles.length; i += 1) {
        prev = (prev * (period - 1) + tr(i)) / period;
        out[i] = prev;
    }
    return out;
}

/** Stochastic oscillator: %K over `period` candles smoothed by `smooth`, and %D (3-candle average of %K). */
export function stochastic(candles: Candle[], period = 14, smooth = 3): { k: Series; d: Series } {
    const raw: Series = candles.map(() => null);
    for (let i = period - 1; i < candles.length; i += 1) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j += 1) {
            hi = Math.max(hi, candles[j].high);
            lo = Math.min(lo, candles[j].low);
        }
        raw[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
    }
    const avg = (src: Series, n: number): Series =>
        src.map((_, i) => {
            if (i < n - 1) return null;
            let t = 0;
            for (let j = i - n + 1; j <= i; j += 1) {
                const v = src[j];
                if (v === null) return null;
                t += v;
            }
            return t / n;
        });
    const k = avg(raw, smooth);
    return { k, d: avg(k, 3) };
}

/** MACD: fast EMA minus slow EMA, its signal line, and the histogram between them. */
export function macd(
    candles: Candle[],
    fast = 12,
    slow = 26,
    signal = 9
): { line: Series; signal: Series; hist: Series } {
    const f = ema(candles, fast);
    const s = ema(candles, slow);
    const line: Series = f.map((v, i) => (v !== null && s[i] !== null ? v - (s[i] as number) : null));
    const sig = emaOf(line, signal);
    const hist: Series = line.map((v, i) => (v !== null && sig[i] !== null ? v - (sig[i] as number) : null));
    return { line, signal: sig, hist };
}

/** Heikin Ashi candles: a smoothed version of the same market that makes trends easier to see. */
export function heikinAshi(candles: Candle[]): Candle[] {
    const out: Candle[] = [];
    candles.forEach((c, i) => {
        const close = (c.open + c.high + c.low + c.close) / 4;
        const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
        out.push({ ...c, open, close, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close) });
    });
    return out;
}

export type StudyKey =
    'ma20' | 'ema20' | 'ma50' | 'ma200' | 'ema50' | 'ema200' | 'boll' | 'donch' | 'rsi' | 'macd' | 'stoch' | 'atr';
export type ChartKind = 'candles' | 'hollow' | 'heikin' | 'bars' | 'line' | 'area';

export const STUDIES: { key: StudyKey; label: string; hint: string }[] = [
    { key: 'ma20', label: 'Moving average 20', hint: 'simple, on the price' },
    { key: 'ema20', label: 'EMA 20', hint: 'exponential, on the price' },
    { key: 'ma50', label: 'Moving average 50', hint: 'simple, on the price' },
    { key: 'ma200', label: 'Moving average 200', hint: 'simple, on the price' },
    { key: 'ema50', label: 'EMA 50', hint: 'exponential, on the price' },
    { key: 'ema200', label: 'EMA 200', hint: 'exponential, on the price' },
    { key: 'boll', label: 'Bollinger bands', hint: '20, 2, on the price' },
    { key: 'donch', label: 'Donchian channel', hint: '20 highs and lows, on the price' },
    { key: 'rsi', label: 'RSI 14', hint: 'own strip under the chart' },
    { key: 'macd', label: 'MACD 12 26 9', hint: 'own strip under the chart' },
    { key: 'stoch', label: 'Stochastic 14 3', hint: 'own strip under the chart' },
    { key: 'atr', label: 'ATR 14', hint: 'own strip under the chart' },
];

export const KINDS: { key: ChartKind; label: string }[] = [
    { key: 'candles', label: 'Candles' },
    { key: 'hollow', label: 'Hollow candles' },
    { key: 'heikin', label: 'Heikin Ashi' },
    { key: 'bars', label: 'Bars' },
    { key: 'line', label: 'Line' },
    { key: 'area', label: 'Area' },
];

export interface StudyState {
    kind: ChartKind;
    on: Record<StudyKey, boolean>;
}

export const DEFAULT_STUDIES: StudyState = {
    kind: 'candles',
    on: {
        ma20: false,
        ema20: false,
        ma50: false,
        ma200: false,
        ema50: false,
        ema200: false,
        boll: false,
        donch: false,
        rsi: false,
        macd: false,
        stoch: false,
        atr: false,
    },
};

const KEY = 'epm_chart_studies';

export function loadStudies(): StudyState {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        if (raw && typeof raw === 'object') {
            const kind = KINDS.some(k => k.key === raw.kind) ? (raw.kind as ChartKind) : 'candles';
            return { kind, on: { ...DEFAULT_STUDIES.on, ...(raw.on ?? {}) } };
        }
    } catch {
        /* storage blocked or damaged: start clean */
    }
    return { kind: DEFAULT_STUDIES.kind, on: { ...DEFAULT_STUDIES.on } };
}

export function saveStudies(state: StudyState): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
        /* the choice just is not remembered */
    }
}
