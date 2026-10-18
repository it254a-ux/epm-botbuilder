/**
 * Previous Day High / Low rejection (part of the M15 + M5 mode): pure calculation, no React, no network.
 *
 * The idea, in the words used on the chart and in teaching:
 *  1. PREVIOUS DAY HIGH (PDH) and PREVIOUS DAY LOW (PDL) are the extremes of the last full trading day. Stop orders sit
 *     just beyond them: that area is the LIQUIDITY ZONE.
 *  2. INSTITUTIONAL FOOTPRINT: on the way to the level, at least 2 TALL candles in the direction of the move
 *     (green going up to PDH, red going down to PDL). Tall = range of at least 1.5 x the M5 ATR.
 *  3. LIQUIDITY SWEEP: price touches the level (or pokes beyond it). This is when the WATCH alert is sent. The trader
 *     does not enter yet.
 *  4. REJECTION CANDLE: ONE closed M5 candle in the opposite colour (red at PDH, green at PDL) with a real body
 *     (at least 0.5 ATR) that closes beyond the low (high) of the candle before it. That is the confirmation: enter.
 *     If price keeps running past the level, nothing changes: wait until that candle appears.
 *  5. TRADE: SELL at PDH / BUY at PDL. Entry = close of the latest closed M5 candle. Stop = just beyond the extreme of
 *     the sweep (+0.25 ATR). TARGET 1 = EQUILIBRIUM (the 50% centre of yesterday's range), TARGET 2 = the opposite level.
 *     Refused when the reward is below 1 : 2 or the stop is outside 0.5 to 4 ATR.
 *  6. Only closed candles are used. Missing, old or messy data means no setup, never a guess.
 *
 * Mirror trick (same as mtf.ts): the PDL / BUY case is calculated by flipping the prices (x -> -x) and running the
 * PDH / SELL rule, so both sides always use exactly the same code.
 */
import { atr, type Candle } from './engine';
import { cleanClosed, M15_SEC, M5_SEC } from './mtf';

export type PdhStage = 'none' | 'watch' | 'confirmed';
export type PdhSide = 'BUY' | 'SELL';

export interface PdhMarker {
    time: number;
    price: number;
    kind: 'footprint' | 'sweep' | 'rejection';
    /** Draw above the candle (true) or below it (false). */
    above: boolean;
    text: string;
}
export interface PdhPlan {
    side: PdhSide;
    entry: number;
    stopLoss: number;
    /** Target 1: Equilibrium. */
    takeProfit: number;
    /** Target 2: the opposite level (previous day low for a SELL, high for a BUY). */
    takeProfit2: number;
    rr: number;
    risk: number;
}
export interface PdhResult {
    stage: PdhStage;
    side: PdhSide | null;
    levelName: 'Previous Day High' | 'Previous Day Low' | null;
    levelPrice: number | null;
    levels: { high: number | null; low: number | null; equilibrium: number | null; day: number | null };
    footprint: { count: number; times: number[] };
    sweep: { time: number; price: number } | null;
    rejection: { time: number; close: number } | null;
    plan: PdhPlan | null;
    markers: PdhMarker[];
    headline: string;
    reasons: string[];
    /** End of the latest closed M5 candle used (null without usable data). */
    signalTime: number | null;
    /** Stable for one level on one day: used to send the WATCH alert only once. */
    alertKey: string | null;
    dataProblem?: string;
}

/** Look at this many closed M5 candles (5 hours). */
const WINDOW = 60;
const FOOTPRINT_LOOKBACK = 12;
export const FOOTPRINT_TALL_ATR = 1.5;
export const MIN_FOOTPRINT = 2;
const TOUCH_TOLERANCE_ATR = 0.1;
export const REJECTION_BODY_ATR = 0.5;
/** The Rejection Candle must be one of the last (FRESH + 1) closed M5 candles. */
const FRESH = 2;
/** A touch older than this many M5 candles (3 hours) is no longer a live setup. */
const TOUCH_MAX_AGE = 36;
/** Price may not have fallen this many ATR below the Rejection Candle's close (do not chase). */
const CHASE_ATR = 1.5;
/** Price left the zone this many ATR without a Rejection Candle: the setup is over. */
const LEFT_ZONE_ATR = 2;
const SL_BUFFER_ATR = 0.25;
const MIN_RISK_ATR = 0.5;
const MAX_RISK_ATR = 4;
export const PDH_MIN_RR = 2;
const STALE_AFTER = 3;
const MIN_M5 = 40;
const MIN_M15 = 60;
/** A previous trading day must have at least this many M15 candles (of 96) to count. */
const PREV_DAY_MIN_M15 = 60;

const dayStart = (t: number) => Math.floor(t / 86400) * 86400;
const fmt = (n: number) => String(Number(n.toPrecision(8)));
const clock = (t: number) => new Date(t * 1000).toISOString().slice(11, 16) + ' GMT';
const flip = (c: Candle): Candle => ({ time: c.time, open: -c.open, high: -c.low, low: -c.high, close: -c.close });

interface Scan {
    stage: PdhStage;
    /** Everything below is in the frame that was scanned (prices flipped for the PDL case). */
    touchIdx: number;
    footprintIdx: number[];
    rejectionIdx: number;
    plan: { entry: number; stop: number; tp1: number; tp2: number; rr: number; risk: number } | null;
    /** Lines for "reasons" (text uses wording helpers so it reads right for either side). */
    notes: string[];
    /** Why there is no setup, when stage is none. */
    why: string;
}

/**
 * The PDH / SELL rule. `L` is the level, `eq` the equilibrium and `far` the opposite level, all in the scanned frame
 * (for the PDL case the caller passes flipped values and flipped candles).
 */
function scanHigh(w: Candle[], L: number, eq: number, far: number, atr5: number, word: { level: string; up: string; down: string; green: string; red: string; high: string; low: string }): Scan {
    const none = (why: string, extra: Partial<Scan> = {}): Scan => ({ stage: 'none', touchIdx: -1, footprintIdx: [], rejectionIdx: -1, plan: null, notes: [], why, ...extra });
    const last = w.length - 1;
    const tol = TOUCH_TOLERANCE_ATR * atr5;

    // the start of the most recent contact with the level
    let t = -1;
    for (let i = 0; i < w.length; i++) {
        if (w[i].high >= L - tol && (i === 0 || w[i - 1].high < L - tol)) t = i;
    }
    if (t < 0) return none(`Price has not touched the ${word.level} in the last ${WINDOW} M5 candles.`);
    if (last - t > TOUCH_MAX_AGE) return none(`The touch of the ${word.level} is more than ${TOUCH_MAX_AGE} M5 candles old.`, { touchIdx: t });

    // Institutional Footprint: tall candles in the direction of the move, on the way to (and at) the level
    const footprintIdx: number[] = [];
    for (let i = Math.max(0, t - FOOTPRINT_LOOKBACK); i <= t; i++) {
        const c = w[i];
        if (c.close > c.open && c.high - c.low >= FOOTPRINT_TALL_ATR * atr5) footprintIdx.push(i);
    }
    if (footprintIdx.length < MIN_FOOTPRINT) {
        return none(
            `Price touched the ${word.level}, but only ${footprintIdx.length} tall ${word.green} candle${footprintIdx.length === 1 ? '' : 's'} came with it (at least ${MIN_FOOTPRINT} are needed to show an Institutional Footprint).`,
            { touchIdx: t, footprintIdx }
        );
    }

    // Rejection Candle: the first opposite-colour candle from the touch on, with a real body, closing beyond the previous candle's low
    let j = -1;
    for (let i = Math.max(t, 1); i <= last; i++) {
        const c = w[i];
        if (c.close < c.open && c.open - c.close >= REJECTION_BODY_ATR * atr5 && c.close < w[i - 1].low) {
            j = i;
            break;
        }
    }
    const base = { touchIdx: t, footprintIdx, rejectionIdx: j };
    const maxHigh = Math.max(...w.slice(t).map(c => c.high));

    if (j < 0) {
        if (w[last].close < L - LEFT_ZONE_ATR * atr5) {
            return none(`Price left the ${word.level} area without a Rejection Candle, so this setup is over.`, base);
        }
        return {
            stage: 'watch', ...base, plan: null, why: '',
            notes: [
                `Price touched the ${word.level} ${fmt(L)} (highest point so far ${fmt(maxHigh)}).`,
                `Wait for ONE ${word.red} M5 candle with a real body that closes ${word.down} the candle before it. Do not enter before that.`,
                'If price keeps running past the level, keep waiting for that candle.',
            ],
        };
    }
    const age = last - j;
    if (age > FRESH) return none(`The Rejection Candle formed ${age} candles ago, so the entry has already passed.`, base);
    if (w[j].close - w[last].close > CHASE_ATR * atr5) return none('Price has already moved too far from the Rejection Candle: chasing is not allowed.', base);

    const entry = w[last].close;
    const stop = maxHigh + SL_BUFFER_ATR * atr5;
    const risk = stop - entry;
    if (!(risk > 0)) return none('The stop loss would not be on the right side of the entry.', base);
    if (risk < MIN_RISK_ATR * atr5) return none(`The stop loss would be only ${(risk / atr5).toFixed(2)} ATR from the entry (minimum ${MIN_RISK_ATR}): normal movement would hit it.`, base);
    if (risk > MAX_RISK_ATR * atr5) return none(`The stop loss would be ${(risk / atr5).toFixed(2)} ATR from the entry (maximum ${MAX_RISK_ATR}): too wide to be a clean setup.`, base);
    if (!(eq < entry)) return none('Price is already at or beyond the Equilibrium, so there is no room for Target 1.', base);
    const rr = (entry - eq) / risk;
    if (rr < PDH_MIN_RR) return none(`Target 1 (Equilibrium ${fmt(eq)}) gives a reward of only ${rr.toFixed(2)} times the risk (minimum ${PDH_MIN_RR}).`, base);

    return {
        stage: 'confirmed', ...base, why: '',
        plan: { entry, stop, tp1: eq, tp2: far, rr, risk },
        notes: [
            `Price touched the ${word.level} ${fmt(L)} (highest point ${fmt(maxHigh)}).`,
            `A ${word.red} M5 candle with a real body closed ${word.down} the candle before it: the Rejection Candle.`,
        ],
    };
}

const emptyResult = (over: Partial<PdhResult>): PdhResult => ({
    stage: 'none', side: null, levelName: null, levelPrice: null,
    levels: { high: null, low: null, equilibrium: null, day: null },
    footprint: { count: 0, times: [] }, sweep: null, rejection: null, plan: null, markers: [],
    headline: 'No Previous Day High/Low setup right now.', reasons: [], signalTime: null, alertKey: null, ...over,
});

function analyseUnsafe(m15Raw: Candle[], m5Raw: Candle[], now: number): PdhResult {
    const m15 = cleanClosed(Array.isArray(m15Raw) ? m15Raw : [], M15_SEC, now);
    const m5 = cleanClosed(Array.isArray(m5Raw) ? m5Raw : [], M5_SEC, now);
    const problem = (text: string) =>
        emptyResult({ dataProblem: text, headline: 'No Previous Day High/Low setup: the data is not reliable.', reasons: [`${text} No setup is given without reliable data.`] });
    if (m5.length < MIN_M5) return problem(`Not enough closed M5 candles (${m5.length}, need ${MIN_M5}).`);
    if (m15.length < MIN_M15) return problem(`Not enough closed M15 candles (${m15.length}, need ${MIN_M15}).`);
    const lastEnd = m5[m5.length - 1].time + M5_SEC;
    if (now - lastEnd > STALE_AFTER * M5_SEC) return problem(`M5 data is stale: the latest closed candle ended at ${clock(lastEnd)}.`);

    // previous trading day: the most recent earlier UTC day that is well covered (so Monday uses Friday)
    const today = dayStart(m5[m5.length - 1].time);
    const counts = new Map<number, Candle[]>();
    for (const c of m15) {
        const d = dayStart(c.time);
        if (d < today) counts.set(d, [...(counts.get(d) ?? []), c]);
    }
    const days = [...counts.keys()].filter(d => (counts.get(d) as Candle[]).length >= PREV_DAY_MIN_M15).sort((a, b) => b - a);
    if (!days.length) return emptyResult({ reasons: ['The previous trading day is not available in the M15 data, so its high and low are unknown.'], signalTime: lastEnd });
    const prev = counts.get(days[0]) as Candle[];
    const pdh = Math.max(...prev.map(c => c.high));
    const pdl = Math.min(...prev.map(c => c.low));
    const eq = (pdh + pdl) / 2;
    const levels = { high: pdh, low: pdl, equilibrium: eq, day: days[0] };

    const a5 = atr(m5, 14);
    if (!a5 || a5 <= 0) return problem('There is not enough M5 data to measure a normal candle size (ATR).');
    const w = m5.slice(-WINDOW);

    const wordsHigh = { level: 'Previous Day High', up: 'above', down: 'below', green: 'green', red: 'red', high: 'high', low: 'low' };
    const wordsLow = { level: 'Previous Day Low', up: 'below', down: 'above', green: 'red', red: 'green', high: 'low', low: 'high' };
    const hi = scanHigh(w, pdh, eq, pdl, a5, wordsHigh);
    const lo = scanHigh(w.map(flip), -pdl, -eq, -pdh, a5, wordsLow);
    const rank = (s: Scan) => (s.stage === 'confirmed' ? 3 : s.stage === 'watch' ? 2 : s.touchIdx >= 0 ? 1 : 0);
    const useLow = rank(lo) > rank(hi) || (rank(lo) === rank(hi) && rank(lo) > 0 && lo.touchIdx > hi.touchIdx);
    const scan = useLow ? lo : hi;
    const sign = useLow ? -1 : 1;
    const side: PdhSide = useLow ? 'BUY' : 'SELL';
    const levelName = useLow ? 'Previous Day Low' : 'Previous Day High';
    const levelPrice = useLow ? pdl : pdh;
    const at = (i: number) => w[i];

    if (scan.touchIdx < 0 && rank(scan) === 0) {
        return emptyResult({ levels, signalTime: lastEnd, reasons: [`Previous Day High ${fmt(pdh)}, Previous Day Low ${fmt(pdl)}.`, hi.why, lo.why] });
    }

    const markers: PdhMarker[] = [];
    // footprint candles: only the last one carries the label, so the chart stays readable
    scan.footprintIdx.forEach((i, n) =>
        markers.push({ time: at(i).time, price: useLow ? at(i).low : at(i).high, kind: 'footprint', above: !useLow, text: n === scan.footprintIdx.length - 1 ? `Institutional Footprint (${scan.footprintIdx.length})` : '' })
    );
    if (scan.touchIdx >= 0) {
        markers.push({ time: at(scan.touchIdx).time, price: useLow ? at(scan.touchIdx).low : at(scan.touchIdx).high, kind: 'sweep', above: !useLow, text: 'Liquidity Sweep' });
    }
    if (scan.rejectionIdx >= 0) {
        markers.push({ time: at(scan.rejectionIdx).time, price: at(scan.rejectionIdx).close, kind: 'rejection', above: !useLow, text: scan.stage === 'confirmed' ? `Rejection Candle: ${side}` : 'Rejection Candle' });
    }

    const footprint = { count: scan.footprintIdx.length, times: scan.footprintIdx.map(i => at(i).time) };
    // the extreme reached since the touch, in real (unflipped) prices
    const sweep =
        scan.touchIdx >= 0
            ? { time: at(scan.touchIdx).time, price: useLow ? Math.min(...w.slice(scan.touchIdx).map(c => c.low)) : Math.max(...w.slice(scan.touchIdx).map(c => c.high)) }
            : null;
    const rejection = scan.rejectionIdx >= 0 ? { time: at(scan.rejectionIdx).time, close: at(scan.rejectionIdx).close } : null;

    const footLine = `Institutional Footprint: ${footprint.count} tall ${useLow ? 'red' : 'green'} M5 candles on the way to the level (tall = at least ${FOOTPRINT_TALL_ATR} x the normal candle size).`;
    const common = { levels, side, levelName, levelPrice, footprint, sweep, rejection, markers, signalTime: lastEnd, alertKey: `${useLow ? 'PDL' : 'PDH'}|${days[0] + 86400}` } as const;

    if (scan.stage === 'watch') {
        return emptyResult({
            ...common, stage: 'watch',
            headline: `WATCH: price touched the ${levelName} after an Institutional Footprint. Do NOT enter yet. Wait for the Rejection Candle (${useLow ? 'a green' : 'a red'} M5 candle).`,
            reasons: [`${levelName}: ${fmt(levelPrice)}.`, footLine, ...scan.notes, `Target 1 will be the Equilibrium ${fmt(eq)}, Target 2 the ${useLow ? 'Previous Day High' : 'Previous Day Low'} ${fmt(useLow ? pdh : pdl)}.`],
        });
    }
    if (scan.stage === 'confirmed' && scan.plan) {
        const p = scan.plan;
        return emptyResult({
            ...common, stage: 'confirmed',
            plan: { side, entry: sign * p.entry, stopLoss: sign * p.stop, takeProfit: sign * p.tp1, takeProfit2: sign * p.tp2, rr: p.rr, risk: p.risk },
            headline: `CONFIRMED ${side}: the Rejection Candle formed at the ${levelName}. This is the entry.`,
            reasons: [`${levelName}: ${fmt(levelPrice)}.`, footLine, ...scan.notes, `Stop loss just beyond the sweep. Target 1 = Equilibrium ${fmt(eq)}, Target 2 = ${useLow ? 'Previous Day High' : 'Previous Day Low'} ${fmt(useLow ? pdh : pdl)}. Reward ${p.rr.toFixed(2)} times the risk.`],
        });
    }
    return emptyResult({
        ...common, stage: 'none', plan: null, alertKey: null,
        headline: 'No Previous Day High/Low setup right now.',
        reasons: [`${levelName}: ${fmt(levelPrice)}.`, scan.why],
    });
}

/**
 * @param m15 raw M15 candles (closed or forming; forming ones are ignored)
 * @param m5  raw M5 candles
 * @param now seconds since epoch
 * Never throws: on any problem the answer is "no setup" with the reason.
 */
export function analysePreviousDay(m15: Candle[], m5: Candle[], now: number): PdhResult {
    try {
        return analyseUnsafe(m15, m5, now);
    } catch (err) {
        const why = err instanceof Error ? err.message : 'unknown error';
        return emptyResult({ dataProblem: `analysis error: ${why}`, headline: 'No Previous Day High/Low setup: the analysis could not be completed.', reasons: [`The analysis could not be completed (${why}). No setup is given without reliable data.`] });
    }
}
