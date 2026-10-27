/**
 * Liquidity Grab Reversal ("stop-hunt at the day's extreme"): pure calculation, no React, no network.
 * Works on closed M5 candles only, on any market.
 *
 * The idea, in the words used on the chart and in the Telegram message:
 *  1. A KEY LEVEL: Previous Day High / Low, the Asian High / Low (once the Asian session has ended) or today's own
 *     highest high / lowest low so far. Stop orders sit just beyond it.
 *  2. INSTITUTIONAL FOOTPRINT: at least 2 TALL candles (range of at least 1.5 x the normal candle size) running into the
 *     level in the direction of the move. This is the first sweep. It is NOT traded.
 *  3. PULLBACK: price falls back at least 1 ATR away from that extreme.
 *  4. THE STOP-HUNT LINE: the first extreme + 0.25 ATR. This is where the stop losses of everyone who traded the first
 *     push sit (the "SL line" on the chart).
 *  5. THE TOUCH (the entry): a closed M5 candle reaches the stop-hunt line but does not hold above it:
 *       - it must CLOSE back below the line, and
 *       - the part of the candle beyond the line must be at most 25 % of the candle's full height (a short wick, or a
 *         strong candle that only just touches the line). A long spike through the line, or a close beyond it, means
 *         price is accepted there and nothing is sent (the extreme simply moves up).
 *     Entry = the close of that candle. SELL at a high, BUY at a low.
 *  6. NO stop loss. The take profit is set by the trader as a multiple of the stake (default 2 x the stake).
 *
 * Mirror trick (same as pdh.ts): the BUY case is calculated by flipping the prices (x -> -x) and running the SELL rule.
 */
import { atr, type Candle } from './engine';
import { cleanClosed, M5_SEC } from './mtf';

export type GrabSide = 'BUY' | 'SELL';
export type GrabStage = 'none' | 'watch' | 'signal';
export type GrabKind = 'pd' | 'asian' | 'today';

export interface GrabMarker {
    time: number;
    price: number;
    kind: 'footprint' | 'sweep' | 'pullback' | 'touch';
    above: boolean;
    text: string;
}
export interface GrabResult {
    stage: GrabStage;
    side: GrabSide | null;
    kind: GrabKind | null;
    levelName: string | null;
    /** The key level that was swept (real prices). */
    levelPrice: number | null;
    /** The first extreme (highest high for a SELL, lowest low for a BUY). */
    extreme: { time: number; price: number } | null;
    /** The stop-hunt line: first extreme beyond which the stops sit. */
    stopLine: number | null;
    pullback: { time: number; price: number } | null;
    footprint: { count: number; times: number[]; giant: boolean };
    touch: { time: number; high: number; low: number; close: number; overshootShare: number } | null;
    /** The entry: close of the touch candle. */
    entry: number | null;
    atr: number | null;
    markers: GrabMarker[];
    levels: { pdh: number | null; pdl: number | null; asianHigh: number | null; asianLow: number | null; day: number | null };
    headline: string;
    reasons: string[];
    /** End of the latest closed M5 candle used. */
    signalTime: number | null;
    /** Stable per market + level + side + day: sends the heads-up only once. */
    alertKey: string | null;
    /** Stable per setup: the same signal is never sent twice. */
    setupId: string | null;
    dataProblem?: string;
}

const TALL_ATR = 1.5;
const GIANT_ATR = 3;
const MIN_FOOTPRINT = 2;
const FOOTPRINT_LOOKBACK = 12;
const TOUCH_TOLERANCE_ATR = 0.1;
const PULLBACK_ATR = 1;
export const STOP_LINE_BUFFER_ATR = 0.25;
/** The part of the touch candle beyond the stop-hunt line may be at most this share of the candle's height. */
export const MAX_OVERSHOOT_SHARE = 0.25;
/** The touch must be one of the last (FRESH + 1) closed candles. */
const FRESH = 1;
const CHASE_ATR = 1;
const MAX_CONTACT_AGE = 288;
const TODAY_MIN_CANDLES = 24;
const STALE_AFTER = 3;
const MIN_M5 = 100;
const DAY_MIN_M5 = 200;
const ASIAN_END_HOUR = 7;

const dayStart = (t: number) => Math.floor(t / 86400) * 86400;
const fmt = (n: number) => String(Number(n.toPrecision(8)));
const flip = (c: Candle): Candle => ({ time: c.time, open: -c.open, high: -c.low, low: -c.high, close: -c.close });

interface Hit {
    stage: 'none' | 'watch' | 'signal';
    s: number;
    hIdx: number;
    H: number;
    stopLine: number;
    pullIdx: number;
    footprintIdx: number[];
    giant: boolean;
    trig: number;
    overshootShare: number;
    why: string;
}

/** The SELL rule on one swept level. `s` is the candle where the first sweep began. */
function scanFrame(w: Candle[], s: number, atr5: number): Hit {
    const last = w.length - 1;
    const base: Hit = { stage: 'none', s, hIdx: s, H: w[s].high, stopLine: 0, pullIdx: -1, footprintIdx: [], giant: false, trig: -1, overshootShare: 0, why: '' };

    const aTop = atr(w.slice(0, s), 14) || atr5;
    const footprintIdx: number[] = [];
    let giant = false;
    for (let i = Math.max(0, s - FOOTPRINT_LOOKBACK); i <= Math.min(last, s + 2); i++) {
        const c = w[i];
        if (c.close > c.open && c.high - c.low >= TALL_ATR * aTop) {
            footprintIdx.push(i);
            if (c.high - c.low >= GIANT_ATR * aTop) giant = true;
        }
    }
    base.footprintIdx = footprintIdx;
    base.giant = giant;
    if (footprintIdx.length < MIN_FOOTPRINT) {
        return { ...base, why: `Only ${footprintIdx.length} tall candle(s) ran into the level: no Institutional Footprint.` };
    }

    let H = w[s].high;
    let hIdx = s;
    let pbLow = Infinity;
    let pbIdx = -1;
    let pulled = false;
    for (let i = s + 1; i <= last; i++) {
        const c = w[i];
        const stopLine = H + STOP_LINE_BUFFER_ATR * atr5;
        if (pulled && c.high >= stopLine) {
            const range = c.high - c.low;
            const share = range > 0 ? (c.high - stopLine) / range : 0;
            if (c.close < stopLine && share <= MAX_OVERSHOOT_SHARE) {
                return { ...base, stage: 'signal', hIdx, H, stopLine, pullIdx: pbIdx, trig: i, overshootShare: share };
            }
            // price was accepted above the line (or the spike was too long): the extreme moves up, start the pullback again
            H = c.high;
            hIdx = i;
            pulled = false;
            pbLow = Infinity;
            pbIdx = -1;
            continue;
        }
        if (c.high > H) {
            H = c.high;
            hIdx = i;
            pulled = false;
            pbLow = Infinity;
            pbIdx = -1;
            continue;
        }
        if (c.low < pbLow) {
            pbLow = c.low;
            pbIdx = i;
        }
        if (H - pbLow >= PULLBACK_ATR * atr5) pulled = true;
    }
    return { ...base, stage: 'watch', hIdx, H, stopLine: H + STOP_LINE_BUFFER_ATR * atr5, pullIdx: pulled ? pbIdx : -1 };
}

const emptyResult = (over: Partial<GrabResult>): GrabResult => ({
    stage: 'none', side: null, kind: null, levelName: null, levelPrice: null, extreme: null, stopLine: null, pullback: null,
    footprint: { count: 0, times: [], giant: false }, touch: null, entry: null, atr: null, markers: [],
    levels: { pdh: null, pdl: null, asianHigh: null, asianLow: null, day: null },
    headline: 'No liquidity-grab setup right now.', reasons: [], signalTime: null, alertKey: null, setupId: null, ...over,
});

interface Candidate {
    kind: GrabKind;
    levelName: string;
    /** Level in the SELL frame (flipped for the BUY case). */
    L: number;
    /** First index to look at for the sweep. */
    start: number;
}

function analyseUnsafe(m5Raw: Candle[], now: number, kind: 'forex' | 'synthetic' | 'other'): GrabResult {
    const m5 = cleanClosed(Array.isArray(m5Raw) ? m5Raw : [], M5_SEC, now);
    const problem = (text: string) => emptyResult({ dataProblem: text, headline: 'No liquidity-grab setup: the data is not reliable.', reasons: [`${text} No setup is given without reliable data.`] });
    if (m5.length < MIN_M5) return problem(`Not enough closed M5 candles (${m5.length}, need ${MIN_M5}).`);
    const lastEnd = m5[m5.length - 1].time + M5_SEC;
    if (now - lastEnd > STALE_AFTER * M5_SEC) return problem('M5 data is stale: the latest closed candle is too old.');
    const a5 = atr(m5, 14);
    if (!a5 || a5 <= 0) return problem('There is not enough M5 data to measure a normal candle size (ATR).');

    const today = dayStart(m5[m5.length - 1].time);
    const startToday = m5.findIndex(c => c.time >= today);
    if (startToday < 0) return problem('No candles for today yet.');

    // previous trading day: the most recent earlier UTC day that is well covered (so Monday uses Friday)
    const byDay = new Map<number, Candle[]>();
    for (const c of m5) {
        const d = dayStart(c.time);
        if (d < today) byDay.set(d, [...(byDay.get(d) ?? []), c]);
    }
    const days = [...byDay.keys()].filter(d => (byDay.get(d) as Candle[]).length >= DAY_MIN_M5).sort((a, b) => b - a);
    const prev = days.length ? (byDay.get(days[0]) as Candle[]) : null;
    const pdh = prev ? Math.max(...prev.map(c => c.high)) : null;
    const pdl = prev ? Math.min(...prev.map(c => c.low)) : null;

    // Asian range: 00:00 to 07:00 UTC today, only once it has finished (derived indices have no Asian session)
    const asianCandles = m5.filter(c => c.time >= today && c.time < today + ASIAN_END_HOUR * 3600);
    const asianDone = kind !== 'synthetic' && m5[m5.length - 1].time >= today + ASIAN_END_HOUR * 3600 && asianCandles.length >= 60;
    const asianHigh = asianDone ? Math.max(...asianCandles.map(c => c.high)) : null;
    const asianLow = asianDone ? Math.min(...asianCandles.map(c => c.low)) : null;
    const levels = { pdh, pdl, asianHigh, asianLow, day: days.length ? days[0] : null };

    const last = m5.length - 1;
    const afterAsian = asianDone ? m5.findIndex(c => c.time >= today + ASIAN_END_HOUR * 3600) : -1;
    const flipped = m5.map(flip);
    const reasonsNone: string[] = [];

    interface Found { hit: Hit; frame: Candle[]; sign: 1 | -1; cand: Candidate }
    const found: Found[] = [];

    const consider = (sign: 1 | -1, cand: Candidate, frame: Candle[]) => {
        // Every moment price reached the level (the start of each contact), oldest first. The first contact that comes with
        // an Institutional Footprint is the first sweep; the scan then follows price from there.
        const contacts: number[] = [];
        if (cand.kind === 'today') {
            // today's own extreme: every new high of the day, but not in the first two hours of the day
            let runMax = -Infinity;
            for (let i = cand.start; i <= last; i++) {
                if (i - cand.start >= TODAY_MIN_CANDLES && frame[i].high > runMax && last - i <= MAX_CONTACT_AGE) contacts.push(i);
                runMax = Math.max(runMax, frame[i].high);
            }
        } else {
            const tol = TOUCH_TOLERANCE_ATR * a5;
            for (let i = Math.max(cand.start, 1); i <= last; i++) {
                if (frame[i].high >= cand.L - tol && frame[i - 1].high < cand.L - tol && last - i <= MAX_CONTACT_AGE) contacts.push(i);
            }
        }
        let after = -1;
        for (const s of contacts) {
            if (s <= after) continue;
            const hit = scanFrame(frame, s, a5);
            if (hit.stage === 'none') {
                if (hit.footprintIdx.length >= MIN_FOOTPRINT) continue;
                continue;
            }
            // an old signal that has already come and gone: look for a later setup after it
            if (hit.stage === 'signal' && last - hit.trig > FRESH) {
                after = hit.trig;
                continue;
            }
            found.push({ hit, frame, sign, cand });
            return;
        }
        if (!contacts.length) return;
        reasonsNone.push(`${cand.levelName}: no sweep with an Institutional Footprint (at least ${MIN_FOOTPRINT} tall candles) in the last 24 hours.`);
    };

    // SELL frame (a high is swept) and BUY frame (a low is swept, prices flipped)
    for (const [sign, frame] of [[1, m5], [-1, flipped]] as [1 | -1, Candle[]][]) {
        const hi = sign === 1;
        const pdLevel = hi ? pdh : pdl;
        if (pdLevel !== null) consider(sign, { kind: 'pd', levelName: hi ? 'Previous Day High' : 'Previous Day Low', L: sign * pdLevel, start: startToday }, frame);
        const asLevel = hi ? asianHigh : asianLow;
        if (asLevel !== null && afterAsian >= 0) consider(sign, { kind: 'asian', levelName: hi ? 'Asian High' : 'Asian Low', L: sign * asLevel, start: afterAsian }, frame);
        consider(sign, { kind: 'today', levelName: hi ? "Today's High" : "Today's Low", L: 0, start: startToday }, frame);
    }

    if (!found.length) {
        return emptyResult({ levels, signalTime: lastEnd, atr: a5, reasons: reasonsNone.length ? reasonsNone : ['No day extreme has been swept with an Institutional Footprint.'] });
    }

    // A fresh touch beats a watch; among equals the most recent sweep wins.
    const freshSignal = (f: Found) => f.hit.stage === 'signal' && last - f.hit.trig <= FRESH;
    const rank = (f: Found) => (freshSignal(f) ? 3 : f.hit.stage === 'watch' && f.hit.pullIdx >= 0 ? 2 : f.hit.stage === 'watch' ? 1 : 0);
    found.sort((x, y) => rank(y) - rank(x) || y.hit.s - x.hit.s);
    const best = found[0];
    const { hit, frame, sign, cand } = best;
    const side: GrabSide = sign === 1 ? 'SELL' : 'BUY';
    const real = (v: number) => sign * v;
    const at = (i: number) => m5[i];
    const high = sign === 1;

    const markers: GrabMarker[] = [];
    hit.footprintIdx.forEach((i, n) =>
        markers.push({ time: at(i).time, price: high ? at(i).high : at(i).low, kind: 'footprint', above: high, text: n === hit.footprintIdx.length - 1 ? `Institutional Footprint (${hit.footprintIdx.length})` : '' })
    );
    markers.push({ time: at(hit.hIdx).time, price: high ? at(hit.hIdx).high : at(hit.hIdx).low, kind: 'sweep', above: high, text: `Liquidity grab: ${cand.levelName} taken` });
    if (hit.pullIdx >= 0) markers.push({ time: at(hit.pullIdx).time, price: high ? at(hit.pullIdx).low : at(hit.pullIdx).high, kind: 'pullback', above: !high, text: 'Pullback' });
    const stopLine = real(hit.stopLine);
    const extreme = { time: at(hit.hIdx).time, price: real(hit.H) };
    const pullback = hit.pullIdx >= 0 ? { time: at(hit.pullIdx).time, price: high ? at(hit.pullIdx).low : at(hit.pullIdx).high } : null;
    const footprint = { count: hit.footprintIdx.length, times: hit.footprintIdx.map(i => at(i).time), giant: hit.giant };
    const common = { side, kind: cand.kind, levelName: cand.levelName, levelPrice: cand.kind === 'today' ? extreme.price : real(cand.L), extreme, stopLine, pullback, footprint, atr: a5, levels, signalTime: lastEnd } as const;

    if (hit.stage === 'signal' && freshSignal(best)) {
        const t = at(hit.trig);
        const entry = t.close;
        const chased = high ? entry - m5[last].close > CHASE_ATR * a5 : m5[last].close - entry > CHASE_ATR * a5;
        if (!chased) {
            markers.push({ time: t.time, price: high ? t.high : t.low, kind: 'touch', above: high, text: `Stop-hunt line touched: ${side}` });
            return emptyResult({
                ...common, stage: 'signal', markers, entry,
                touch: { time: t.time, high: t.high, low: t.low, close: t.close, overshootShare: hit.overshootShare },
                alertKey: `${cand.kind}|${side}|${today}`,
                setupId: `${cand.kind}|${side}|${t.time}`,
                headline: `${side}: price touched the stop-hunt line after taking the ${cand.levelName}. This is the entry.`,
                reasons: [
                    `${cand.levelName}${cand.kind === 'today' ? '' : ` ${fmt(real(cand.L))}`} was taken with ${footprint.count} tall candles${footprint.giant ? ' (including a giant one)' : ''}: the first sweep. Not traded.`,
                    `Price pulled back at least ${PULLBACK_ATR} ATR, then came back to the stop-hunt line ${fmt(stopLine)} (the first extreme ${fmt(extreme.price)} plus ${STOP_LINE_BUFFER_ATR} ATR, where the stops sit).`,
                    `The candle closed back ${high ? 'below' : 'above'} the line with only ${Math.round(hit.overshootShare * 100)}% of it beyond the line (limit ${Math.round(MAX_OVERSHOOT_SHARE * 100)}%).`,
                ],
            });
        }
        reasonsNone.push('Price has already moved too far from the touch candle: chasing is not allowed.');
    } else if (hit.stage === 'signal') {
        reasonsNone.push(`The touch happened ${last - hit.trig} candles ago, so the entry has passed.`);
    }

    if (hit.stage === 'watch' && cand.kind !== 'pd') {
        return emptyResult({
            ...common, stage: 'watch', markers,
            alertKey: `grab-watch|${cand.kind}|${side}|${today}`,
            headline: `WATCH: ${cand.levelName} taken with an Institutional Footprint. Do NOT enter yet.`,
            reasons: [
                `${cand.levelName}${cand.kind === 'today' ? '' : ` ${fmt(real(cand.L))}`} was taken with ${footprint.count} tall candles: the first sweep.`,
                `The extreme is ${fmt(extreme.price)}. The signal comes only if price pulls back, then touches the stop-hunt line ${fmt(stopLine)} and closes back ${high ? 'below' : 'above'} it.`,
            ],
        });
    }
    return emptyResult({ ...common, stage: 'none', markers: [], levels, reasons: reasonsNone.slice(0, 6) });
}

/**
 * @param m5   raw closed or forming M5 candles (forming ones are ignored); at least ~4 days for the previous trading day
 * @param now  seconds since epoch
 * @param kind market kind: derived indices have no Asian session
 * Never throws: on any problem the answer is "no setup" with the reason.
 */
export function analyseGrab(m5: Candle[], now: number, kind: 'forex' | 'synthetic' | 'other' = 'forex'): GrabResult {
    try {
        return analyseUnsafe(m5, now, kind);
    } catch (err) {
        const why = err instanceof Error ? err.message : 'unknown error';
        return emptyResult({ dataProblem: `analysis error: ${why}`, headline: 'No liquidity-grab setup: the analysis could not be completed.', reasons: [`The analysis could not be completed (${why}).`] });
    }
}
