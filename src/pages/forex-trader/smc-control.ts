/**
 * WHO IS IN CONTROL of the market (buyers or sellers), read from closed candles only. Pure calculation: no React, no network.
 *
 * The idea (from Hhjh): the side that has held the market longest stays in control, a short push the other way is only a visit.
 * Control changes only when the other side PROVES it:
 *   - SELLERS are in control until a candle CLOSES above the last lower high (a wick does not count) and holds there.
 *   - BUYERS are in control until a candle CLOSES below the last higher low (a wick does not count) and holds there.
 * "Holds" = the next candle also closes beyond the line, or the breaking candle itself is strong (big body, closing near its end).
 *
 * Besides the side, it reports what a trader looks for around it (all read from the candles, nothing guessed):
 *   - wick rejection (a long wick against the side in control = the other side is pushing back),
 *   - a sweep of a swing low / high (the wick took the stops and the candle closed back),
 *   - a reaction (the first strong candle the other way after a sweep),
 *   - a strong sell-off / rally (a big-body candle),
 *   - a retest (price came back to the broken line and held, or failed).
 */
import type { Candle } from './engine';

const SIDE = 3;
/** Only the latest candles' events are drawn, so the chart is not covered in labels. */
const EVENT_WINDOW = 130;
const MAX_EVENTS = 9;

export interface ControlEvent {
    time: number;
    price: number;
    position: 'aboveBar' | 'belowBar';
    color: string;
    text: string;
}

export interface Control {
    who: 'BUYERS' | 'SELLERS' | 'MIXED';
    /** Time of the candle that proved this side's control (null when it has not been proven yet). */
    since: number | null;
    /** The line the OTHER side has to close beyond to take control. */
    flip: { price: number; time: number; label: string; note: string } | null;
    /** A warning about the side in control (wick rejection, a close beyond the line that has not held yet...). */
    weakening: string | null;
    /** Short plain sentences for the alert and the chart panel. */
    signs: string[];
    events: ControlEvent[];
}

const GREEN = '#4ade80';
const RED = '#f87171';

function pivots(c: Candle[], high: boolean): number[] {
    const out: number[] = [];
    for (let i = SIDE; i <= c.length - 1 - SIDE; i++) {
        let ok = true;
        for (let j = 1; j <= SIDE && ok; j++) {
            ok = high ? c[i - j].high < c[i].high && c[i + j].high <= c[i].high : c[i - j].low > c[i].low && c[i + j].low >= c[i].low;
        }
        if (ok) out.push(i);
    }
    return out;
}

const body = (k: Candle) => Math.abs(k.close - k.open);
const range = (k: Candle) => k.high - k.low;

/** Average body of the 10 candles before k. */
function avgBody(c: Candle[], k: number): number {
    const from = Math.max(0, k - 10);
    let s = 0;
    for (let j = from; j < k; j++) s += body(c[j]);
    return k > from ? s / (k - from) : 0;
}
/** A strong candle: a real body (at least half of its range) that is at least as big as the recent average. */
function isStrong(c: Candle[], k: number, up: boolean): boolean {
    const x = c[k];
    const b = up ? x.close - x.open : x.open - x.close;
    const r = range(x);
    return b > 0 && r > 0 && b >= 0.5 * r && b >= avgBody(c, k);
}

/** The most recent pivot (index into c) that was already confirmed before candle k. */
function lastConfirmed(arr: number[], k: number): number {
    let best = -1;
    for (const i of arr) {
        if (i + SIDE <= k - 1) best = i;
        else break;
    }
    return best;
}

const fmt = (p: number) => (Math.abs(p) >= 100 ? p.toFixed(2) : p.toFixed(5));

/**
 * @param c closed candles, oldest first
 * @param a the normal candle size (ATR)
 */
export function readControl(c: Candle[], a: number): Control | null {
    const n = c.length;
    if (n < 40 || !(a > 0)) return null;
    const ph = pivots(c, true);
    const pl = pivots(c, false);
    let who: 'BUYERS' | 'SELLERS' | null = null;
    let since = -1;
    let sinceLevel = 0;
    let pendingText: string | null = null;
    const events: ControlEvent[] = [];

    for (let k = SIDE * 2; k < n; k++) {
        const hIdx = lastConfirmed(ph, k);
        const lIdx = lastConfirmed(pl, k);
        if (who !== 'BUYERS' && hIdx >= 0 && c[k].close > c[hIdx].high + 0.05 * a) {
            // a candle CLOSED above the last high: it holds when the next candle also closes above it, or the breaking candle is strong
            const level = c[hIdx].high;
            const next = k + 1 < n ? c[k + 1] : null;
            const holds = (next !== null && next.close > level) || isStrong(c, k, true);
            if (holds) {
                who = 'BUYERS';
                since = k;
                sinceLevel = level;
                pendingText = null;
                events.push({ time: c[k].time, price: c[k].low, position: 'belowBar', color: GREEN, text: 'BUYERS CONFIRMED' });
            } else if (k === n - 1) {
                pendingText = `A candle closed above ${fmt(level)}: waiting to see if buyers hold it`;
            }
        } else if (who !== 'SELLERS' && lIdx >= 0 && c[k].close < c[lIdx].low - 0.05 * a) {
            const level = c[lIdx].low;
            const next = k + 1 < n ? c[k + 1] : null;
            const holds = (next !== null && next.close < level) || isStrong(c, k, false);
            if (holds) {
                who = 'SELLERS';
                since = k;
                sinceLevel = level;
                pendingText = null;
                events.push({ time: c[k].time, price: c[k].high, position: 'aboveBar', color: RED, text: 'SELLERS CONFIRMED' });
            } else if (k === n - 1) {
                pendingText = `A candle closed below ${fmt(level)}: waiting to see if sellers hold it`;
            }
        }
    }

    // ---- the line the other side must close beyond
    let flip: Control['flip'] = null;
    if (who === 'SELLERS') {
        const i = lastConfirmed(ph, n);
        if (i >= 0) {
            const prev = ph.filter(p => p < i).slice(-1)[0];
            const lower = prev === undefined || c[i].high < c[prev].high;
            flip = {
                price: c[i].high,
                time: c[i].time,
                label: lower ? 'LAST LOWER HIGH · buyers must close above' : 'LAST HIGH · buyers must close above',
                note: `Buyers take control only if a candle closes above ${fmt(c[i].high)}`,
            };
        }
    } else if (who === 'BUYERS') {
        const i = lastConfirmed(pl, n);
        if (i >= 0) {
            const prev = pl.filter(p => p < i).slice(-1)[0];
            const higher = prev === undefined || c[i].low > c[prev].low;
            flip = {
                price: c[i].low,
                time: c[i].time,
                label: higher ? 'LAST HIGHER LOW · sellers must close below' : 'LAST LOW · sellers must close below',
                note: `Sellers take control only if a candle closes below ${fmt(c[i].low)}`,
            };
        }
    }

    const last = c[n - 1];
    const signs: string[] = [];
    let weakening: string | null = pendingText;

    // ---- wick rejection on the latest closed candles, against the side in control
    for (const k of [n - 1, n - 2]) {
        if (weakening) break;
        const x = c[k];
        const r = range(x);
        const b = Math.max(body(x), 0.1 * a);
        const upper = x.high - Math.max(x.open, x.close);
        const lower = Math.min(x.open, x.close) - x.low;
        if (who === 'SELLERS' && lower >= 2 * b && lower >= 0.5 * r && lower >= 0.5 * a) {
            weakening = 'Long lower wick: buyers are rejecting the lows';
        } else if (who === 'BUYERS' && upper >= 2 * b && upper >= 0.5 * r && upper >= 0.5 * a) {
            weakening = 'Long upper wick: sellers are rejecting the highs';
        }
    }
    if (!weakening && who === 'SELLERS' && isStrong(c, n - 1, true) && body(last) >= 1.5 * avgBody(c, n - 1)) weakening = 'Strong green candle: buyers are pushing back';
    if (!weakening && who === 'BUYERS' && isStrong(c, n - 1, false) && body(last) >= 1.5 * avgBody(c, n - 1)) weakening = 'Strong red candle: sellers are pushing back';

    const from = Math.max(SIDE * 2, n - EVENT_WINDOW);

    // ---- sweeps: a wick takes out a swing low / high and the candle closes back
    const sweepsLow: number[] = [];
    const sweepsHigh: number[] = [];
    for (const p of pl) {
        for (let k = p + SIDE + 1; k < n; k++) {
            if (c[k].close < c[p].low) break; // a real break, not a sweep
            if (c[k].low < c[p].low) {
                if (k >= from) sweepsLow.push(k);
                break;
            }
        }
    }
    for (const p of ph) {
        for (let k = p + SIDE + 1; k < n; k++) {
            if (c[k].close > c[p].high) break;
            if (c[k].high > c[p].high) {
                if (k >= from) sweepsHigh.push(k);
                break;
            }
        }
    }
    const lastLow = Array.from(new Set(sweepsLow)).slice(-2);
    const lastHigh = Array.from(new Set(sweepsHigh)).slice(-2);
    lastLow.forEach(k => events.push({ time: c[k].time, price: c[k].low, position: 'belowBar', color: GREEN, text: 'SWEEP OF THE LOW' }));
    lastHigh.forEach(k => events.push({ time: c[k].time, price: c[k].high, position: 'aboveBar', color: RED, text: 'SWEEP OF THE HIGH' }));

    // ---- reaction: the first strong candle the other way, right after a sweep
    lastLow.forEach(k => {
        for (let j = k; j <= Math.min(n - 1, k + 4); j++) {
            if (isStrong(c, j, true)) {
                events.push({ time: c[j].time, price: c[j].low, position: 'belowBar', color: GREEN, text: 'BUYERS REACT' });
                break;
            }
        }
    });
    lastHigh.forEach(k => {
        for (let j = k; j <= Math.min(n - 1, k + 4); j++) {
            if (isStrong(c, j, false)) {
                events.push({ time: c[j].time, price: c[j].high, position: 'aboveBar', color: RED, text: 'SELLERS REACT' });
                break;
            }
        }
    });

    // ---- strong sell-off / strong rally: the biggest big-body candle of the latest stretch
    let bestRed = -1;
    let bestGreen = -1;
    for (let k = Math.max(SIDE * 2, n - 80); k < n; k++) {
        const big = body(c[k]) >= 1.8 * Math.max(avgBody(c, k), 0.2 * a) && body(c[k]) >= 0.6 * range(c[k]);
        if (!big) continue;
        if (c[k].close < c[k].open && (bestRed < 0 || body(c[k]) > body(c[bestRed]))) bestRed = k;
        if (c[k].close > c[k].open && (bestGreen < 0 || body(c[k]) > body(c[bestGreen]))) bestGreen = k;
    }
    if (bestRed >= 0) events.push({ time: c[bestRed].time, price: c[bestRed].high, position: 'aboveBar', color: RED, text: 'STRONG SELL-OFF' });
    if (bestGreen >= 0) events.push({ time: c[bestGreen].time, price: c[bestGreen].low, position: 'belowBar', color: GREEN, text: 'STRONG RALLY' });

    // ---- retest: after control changed, did price come back to the broken line and hold (or fail)?
    if (who && since >= 0) {
        for (let j = since + 1; j < n; j++) {
            if (who === 'BUYERS') {
                if (c[j].close < sinceLevel - 0.05 * a) {
                    signs.push(`Retest failed: price closed back below ${fmt(sinceLevel)}`);
                    break;
                }
                if (c[j].low <= sinceLevel + 0.25 * a && c[j].close > sinceLevel) {
                    if (j >= from) events.push({ time: c[j].time, price: c[j].low, position: 'belowBar', color: GREEN, text: 'RETEST HELD' });
                    signs.push(`Retest held: price came back to ${fmt(sinceLevel)} and buyers defended it`);
                    break;
                }
            } else {
                if (c[j].close > sinceLevel + 0.05 * a) {
                    signs.push(`Retest failed: price closed back above ${fmt(sinceLevel)}`);
                    break;
                }
                if (c[j].high >= sinceLevel - 0.25 * a && c[j].close < sinceLevel) {
                    if (j >= from) events.push({ time: c[j].time, price: c[j].high, position: 'aboveBar', color: RED, text: 'RETEST HELD' });
                    signs.push(`Retest held: price came back to ${fmt(sinceLevel)} and sellers defended it`);
                    break;
                }
            }
        }
    }

    if (who) signs.unshift(`${who === 'BUYERS' ? 'Buyers' : 'Sellers'} are in control: a candle closed ${who === 'BUYERS' ? 'above' : 'below'} the last ${who === 'BUYERS' ? 'high' : 'low'}`);
    else signs.push('No side has proven control yet');
    if (weakening) signs.push(weakening);

    events.sort((x, y) => x.time - y.time);
    return {
        who: who ?? 'MIXED',
        since: since >= 0 ? c[since].time : null,
        flip,
        weakening,
        signs,
        events: events.filter(e => e.time >= c[from].time).slice(-MAX_EVENTS),
    };
}

/** True when the two readings would draw the same thing (the chart then skips a redraw). */
export function sameControl(x: Control | null, y: Control | null): boolean {
    if (x === y) return true;
    if (!x || !y) return false;
    return x.who === y.who && x.since === y.since && x.flip?.price === y.flip?.price && x.weakening === y.weakening && x.events.length === y.events.length;
}
