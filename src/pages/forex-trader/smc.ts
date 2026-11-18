/**
 * Smart Money strategy (ICT category, number 34): pure calculation, no React, no network.
 * It follows the two Smart Money videos step by step. Everything below is written for a SELL. A BUY is calculated on
 * mirrored candles (every price x -> -x) with the very same rule, and turned back for display.
 *
 *  1. DIRECTION: a candle closes below a swing low that was still untouched = BOS (break of structure). Sellers are in control.
 *  2. ZONE: the swing high that started the drop is the SUPPLY ZONE (top = that high, bottom = where the first strong red candle opened).
 *     A candle that CLOSES above the top of the zone cancels the idea. A wick above it does not.
 *  3. TARGET: the lowest low of the drop = SELL SIDE LIQUIDITY (where the stops are resting).
 *  4. RETRACE: price comes back up into the zone. The zone is "unmitigated" until price touches it, "mitigated" after.
 *  5. SWEEP (LS) / INDUCEMENT: on the way up, price takes out swing highs formed after the BOS. The one nearest the zone is the
 *     MAJOR INDUCEMENT (the trap), an earlier one is the MINOR INDUCEMENT. No sweep = no trade.
 *  6. MSS (market structure shift): after the sweep and the touch of the zone, price makes a swing low. A STRONG red candle that
 *     closes below that low is the confirmation and the entry.
 *  7. TRADE: stop loss above the zone (and above any wick that went through it) + a small buffer, take profit at the target,
 *     at least 1 : 2. IL-1 / IL-2 are the internal liquidity lows below: while price keeps breaking them, the trade is held.
 *     A stop and the target in the same candle counts as a loss.
 * Closed candles only. Anything missing, old or unclear: no signal.
 */
import { atr, px, sessionAt, MIN_RR, type Analysis, type Candle, type MarketKind, type Side, type Stage, type SweepStrategyId, type TradePlan, type SetupState } from './engine';

export const SMC_ID = 34;
export const SMC_NAME = 'Smart money: BOS + zone + sweep + MSS';
/** A swing point is the highest / lowest of this many candles on each side. */
export const SMC_PIVOT_SIDE = 3;
const MAX_CANDLES = 400;
const MIN_CANDLES = 60;
/** A break of structure older than this many candles is forgotten. */
const BOS_MAX_AGE = 150;
/** The drop that broke the structure must be at least this many ATR tall (a real push, not a drift). */
const MIN_LEG_ATR = 1.5;
const MIN_ZONE_ATR = 0.3;
const MAX_ZONE_ATR = 3;
const SL_BUFFER_ATR = 0.1;
/** The confirming candle: body at least this share of its whole range, and at least the average body of the last 10 candles. */
const STRONG_BODY_SHARE = 0.5;
const STALE_AFTER_CANDLES = 3;
/** If price already ran this share of the way to the target after the entry, the entry has passed. */
const LATE_SHARE = 0.5;

export interface SmcLine {
    price: number;
    fromTime: number;
    /** null = the line runs on to the right edge. */
    toTime: number | null;
    label: string;
    /** A level that price is expected to go for but has not taken yet (drawn dashed, runs on to the right). */
    pending?: boolean;
}

/** The market's own swings (HH / HL = rising, LH / LL = falling) and the sentiment they add up to. */
export interface SmcTrend {
    sentiment: 'BULLISH' | 'BEARISH' | 'RANGING';
    /** True when the setup trades in the direction of the sentiment (SELL in a bearish market, BUY in a bullish one). */
    withSetup: boolean;
    swings: { time: number; price: number; high: boolean; tag: 'HH' | 'LH' | 'HL' | 'LL' }[];
}

/** Everything the chart needs to draw the markings (real prices, real times). */
export interface SmcOverlay {
    /** Changes whenever something drawn changes. */
    key: string;
    side: Side;
    zone: { top: number; bottom: number; startTime: number; label: string; touched: boolean };
    bos: SmcLine;
    /** Sell-side (BUY setup: buy-side) liquidity, the take profit. */
    target: SmcLine;
    minor: SmcLine | null;
    major: (SmcLine & { sweepTime: number }) | null;
    /** Point of control of the drop that made the break: the price where price spent the most time (Deriv candles carry no volume). */
    poc: (SmcLine & { nearZone: boolean }) | null;
    mss: SmcLine | null;
    internals: (SmcLine & { broken: boolean })[];
    plan: { entry: number; stopLoss: number; takeProfit: number; fromTime: number; planned: boolean } | null;
    /** Before the MSS level exists: the area where the entry is expected (the zone edge nearest price), with the stop beyond the zone and the target. */
    area: { entry: number; stopLoss: number; takeProfit: number; fromTime: number } | null;
    entryTime: number | null;
    exit: { time: number; kind: 'target' | 'stop' } | null;
    /** Only for a PAST setup (history): where its drawing stops (its exit, or the end of its life). Missing / null = runs on to the right edge. */
    endTime?: number | null;
    /** Lines of text for the result panel. */
    facts: { label: string; value: string }[];
    /** Swing labels (HH / HL / LH / LL) and the sentiment, drawn on the chart. */
    trend?: SmcTrend | null;
    /** The POC when it lies between the entry and the target: the first (partial) take profit. */
    partialTp?: number | null;
}

interface Pivot {
    idx: number;
    price: number;
}
interface Swept extends Pivot {
    sweepIdx: number;
}

/** Working frame (a SELL): everything the scan found, in indexes and working-frame prices. */
interface Core {
    bosIdx: number;
    bosLevel: number;
    bosFromIdx: number;
    hIdx: number;
    zoneTop: number;
    zoneBottom: number;
    zoneStartIdx: number;
    invalidIdx: number | null;
    touchIdx: number | null;
    /** Price ran to the target after touching the zone, without any entry: the chance is gone. */
    missedIdx: number | null;
    targetPrice: number;
    targetIdx: number;
    poc: number | null;
    nearZone: boolean;
    major: Swept | null;
    minor: Swept | null;
    /** The likely traps before any sweep: swing highs below the zone that are still untouched. */
    watchMajor: Pivot | null;
    watchMinor: Pivot | null;
    mss: Pivot | null;
    weakBreak: boolean;
    triggerIdx: number | null;
    ils: Pivot[];
    entry: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    outcome: { idx: number; kind: 'target' | 'stop' } | null;
    ilBroken: (number | null)[];
}

const mirror = (c: Candle): Candle => ({ time: c.time, open: -c.open, high: -c.low, low: -c.high, close: -c.close });

function pivotHighs(c: Candle[], side: number): number[] {
    const out: number[] = [];
    for (let i = side; i <= c.length - 1 - side; i++) {
        let ok = true;
        for (let j = 1; j <= side && ok; j++) ok = c[i - j].high < c[i].high && c[i + j].high <= c[i].high;
        if (ok) out.push(i);
    }
    return out;
}
function pivotLows(c: Candle[], side: number): number[] {
    const out: number[] = [];
    for (let i = side; i <= c.length - 1 - side; i++) {
        let ok = true;
        for (let j = 1; j <= side && ok; j++) ok = c[i - j].low > c[i].low && c[i + j].low >= c[i].low;
        if (ok) out.push(i);
    }
    return out;
}

const TREND_SWINGS = 5;
/** Labels the latest swings of each kind against the one before it, and reads the sentiment from the last two highs and lows. */
function trendOf(c: Candle[], side: Side): SmcTrend {
    const hi = pivotHighs(c, SMC_PIVOT_SIDE);
    const lo = pivotLows(c, SMC_PIVOT_SIDE);
    const swings: SmcTrend['swings'] = [];
    const tagAll = (idx: number[], high: boolean) => {
        const use = idx.slice(-(TREND_SWINGS + 1));
        for (let k = 1; k < use.length; k++) {
            const price = high ? c[use[k]].high : c[use[k]].low;
            const prev = high ? c[use[k - 1]].high : c[use[k - 1]].low;
            swings.push({ time: c[use[k]].time, price, high, tag: high ? (price > prev ? 'HH' : 'LH') : price > prev ? 'HL' : 'LL' });
        }
    };
    tagAll(hi, true);
    tagAll(lo, false);
    swings.sort((x, y) => x.time - y.time);
    const lastH = swings.filter(s => s.high).slice(-1)[0];
    const lastL = swings.filter(s => !s.high).slice(-1)[0];
    let sentiment: SmcTrend['sentiment'] = 'RANGING';
    if (lastH && lastL) {
        if (lastH.tag === 'HH' && lastL.tag === 'HL') sentiment = 'BULLISH';
        else if (lastH.tag === 'LH' && lastL.tag === 'LL') sentiment = 'BEARISH';
    }
    return { sentiment, withSetup: (side === 'SELL' && sentiment === 'BEARISH') || (side === 'BUY' && sentiment === 'BULLISH'), swings: swings.slice(-8) };
}

/** Strong red candle: a real body (share of its range) that is at least as big as the recent average body. */
function isStrongRed(c: Candle[], k: number): boolean {
    const x = c[k];
    const body = x.open - x.close;
    const range = x.high - x.low;
    if (!(body > 0) || !(range > 0) || body < STRONG_BODY_SHARE * range) return false;
    const from = Math.max(0, k - 10);
    let sum = 0;
    for (let j = from; j < k; j++) sum += Math.abs(c[j].close - c[j].open);
    const avg = k > from ? sum / (k - from) : 0;
    return body >= avg;
}

interface BosEvent {
    /** ATR used for this event (history: measured around the event itself, so old calm or wild periods are judged fairly). */
    a: number;
    idx: number;
    level: number;
    from: number;
    h: number;
}
/** How many of the latest breaks of structure are kept as possible setups. */
const MAX_SETUPS = 6;
/** A finished trade (target or stop) stays on screen for this many candles before the page moves on to a newer setup. */
const SHOW_FINISHED_CANDLES = 3;
/** History (older setups on the chart): a setup lives this many candles after its break of structure, and the break must follow its swing within BOS_MAX_GAP. */
const SETUP_LIFETIME = 200;
const BOS_MAX_GAP = 80;
const HISTORY_CANDLES = 5000;

/** The SELL rule on a series: one Core for each of the latest qualifying breaks of structure (newest first). */
function scan(c: Candle[], a: number, liveIdx: number | null, history = false): Core[] {
    const n = c.length;
    /** Candles that are really closed. The forming candle (the last one, while it is still open) only counts for touches and wicks. */
    const nc = liveIdx ?? n;
    const S = SMC_PIVOT_SIDE;
    const lows = pivotLows(c.slice(0, nc), S);
    const highs = pivotHighs(c.slice(0, nc), S);

    // 1. breaks of structure: a candle closes below a swing low that was still untouched, after a real push down
    const events: BosEvent[] = [];
    for (const L of lows) {
        let i = -1;
        const lastK = history ? Math.min(nc, L + S + 1 + BOS_MAX_GAP) : nc;
        for (let k = L + S + 1; k < lastK; k++) {
            if (c[k].close < c[L].low) {
                i = k;
                break;
            }
        }
        if (i < 0 || (!history && n - 1 - i > BOS_MAX_AGE)) continue;
        let h = -1;
        for (let k = L + 1; k < i; k++) if (h < 0 || c[k].high >= c[h].high) h = k;
        if (h < 0) continue;
        const lowest = Math.min(...c.slice(h, i + 1).map(x => x.low));
        const aa = history ? atr(c.slice(Math.max(0, i - 60), i + 1)) ?? 0 : a;
        if (!(aa > 0) || c[h].high - lowest < MIN_LEG_ATR * aa) continue;
        events.push({ a: aa, idx: i, level: c[L].low, from: L, h });
    }
    events.sort((x, y) => y.idx - x.idx || y.from - x.from);
    const unique: BosEvent[] = [];
    for (const e of events) if (!unique.some(u => u.idx === e.idx)) unique.push(e);
    if (!history) return unique.slice(0, MAX_SETUPS).map(e => scanOne(c, a, e, lows, highs, nc));
    // history: each setup is judged only on the candles of its own life, so later candles can never change it
    return unique.map(e => {
        const cut = Math.min(nc, e.idx + SETUP_LIFETIME + 1);
        return scanOne(c.slice(0, cut), e.a, e, lows.filter(p => p + S < cut), highs.filter(p => p + S < cut), cut);
    });
}

/** A finished (or running) trade from the past, as a drawing that stops where that trade stopped. */
function historyOverlay(core: Core, buy: boolean, c: Candle[]): SmcOverlay | null {
    if (core.triggerIdx === null || core.entry === null || core.stopLoss === null || core.takeProfit === null) return null;
    if (!(core.stopLoss > core.entry) || (core.entry - core.takeProfit) / (core.stopLoss - core.entry) < MIN_RR) return null;
    const R = (m: number) => (buy ? -m : m);
    const T = (i: number) => c[i].time;
    const side: Side = buy ? 'BUY' : 'SELL';
    const zoneName = buy ? 'DEMAND ZONE' : 'SUPPLY ZONE';
    const liqName = buy ? 'BUY SIDE LIQUIDITY' : 'SELL SIDE LIQUIDITY';
    const lifeEnd = Math.min(c.length - 1, core.bosIdx + SETUP_LIFETIME);
    const endIdx = core.outcome ? core.outcome.idx : lifeEnd < c.length - 1 ? lifeEnd : null;
    const endTime = endIdx === null ? null : T(endIdx);
    const entryTime = T(core.triggerIdx);
    const zoneStart = T(core.zoneStartIdx);
    return {
        key: `h|${side}|${zoneStart}|${entryTime}|${endTime}`,
        side,
        zone: {
            top: Math.max(R(core.zoneTop), R(core.zoneBottom)),
            bottom: Math.min(R(core.zoneTop), R(core.zoneBottom)),
            startTime: zoneStart,
            label: `${side} ENTRY AREA · ${zoneName} · MITIGATED`,
            touched: true,
        },
        bos: { price: R(core.bosLevel), fromTime: T(core.bosFromIdx), toTime: T(core.bosIdx), label: 'BOS' },
        target: { price: R(core.takeProfit), fromTime: T(core.targetIdx), toTime: null, label: `${liqName} 🎯` },
        minor: core.minor ? { price: R(core.minor.price), fromTime: T(core.minor.idx), toTime: T(core.minor.sweepIdx), label: 'MINOR INDUCEMENT' } : null,
        major: core.major
            ? { price: R(core.major.price), fromTime: T(core.major.idx), toTime: T(core.major.sweepIdx), label: 'MAJOR INDUCEMENT ( TRAP )', sweepTime: T(core.major.sweepIdx) }
            : null,
        poc: core.poc !== null ? { price: R(core.poc), fromTime: T(core.hIdx), toTime: null, label: core.nearZone ? 'POC + ZONE' : 'POC', nearZone: core.nearZone } : null,
        mss: core.mss ? { price: R(core.mss.price), fromTime: T(core.mss.idx), toTime: entryTime, label: 'MSS' } : null,
        internals: core.ils.map((il, i) => ({
            price: R(il.price),
            fromTime: T(il.idx),
            toTime: core.ilBroken[i] !== null ? T(core.ilBroken[i] as number) : null,
            label: `IL-${i + 1}`,
            broken: core.ilBroken[i] !== null,
        })),
        plan: { entry: R(core.entry), stopLoss: R(core.stopLoss), takeProfit: R(core.takeProfit), fromTime: entryTime, planned: false },
        area: null,
        entryTime,
        exit: core.outcome ? { time: T(core.outcome.idx), kind: core.outcome.kind } : null,
        endTime,
        facts: [],
    };
}

const historyCache = new Map<string, SmcOverlay[]>();
/**
 * Every earlier trade setup (entry taken) found in the candles, both directions, oldest first. Each one is fixed by its own candles:
 * new candles never change or remove it. Pass the current setup so it is not drawn twice.
 * @param candlesRaw closed candles, oldest first (the more are loaded, the further back the history goes)
 */
export function smcHistory(candlesRaw: Candle[], current?: SmcOverlay | null): SmcOverlay[] {
    const c = candlesRaw.slice(-HISTORY_CANDLES);
    if (c.length < MIN_CANDLES) return [];
    const last = c[c.length - 1];
    const ck = `${c.length}|${c[0].time}|${last.time}|${last.close}`;
    let list = historyCache.get(ck);
    if (!list) {
        const seen = new Set<string>();
        const out: SmcOverlay[] = [];
        const add = (cores: Core[], buy: boolean) => {
            for (const k of cores) {
                const o = historyOverlay(k, buy, c);
                if (!o) continue;
                const id = `${o.side}|${o.zone.startTime}|${o.entryTime}`;
                if (seen.has(id)) continue;
                seen.add(id);
                out.push(o);
            }
        };
        add(scan(c, 1, null, true), false);
        add(scan(c.map(mirror), 1, null, true), true);
        out.sort((x, y) => x.zone.startTime - y.zone.startTime);
        list = out;
        historyCache.set(ck, list);
        if (historyCache.size > 6) historyCache.delete(historyCache.keys().next().value as string);
    }
    return current ? list.filter(o => !(o.side === current.side && o.zone.startTime === current.zone.startTime)) : list;
}

/** Steps 2 to 8 for one break of structure. */
function scanOne(c: Candle[], a: number, best: BosEvent, lows: number[], highs: number[], nc: number): Core {
    const n = c.length;
    const S = SMC_PIVOT_SIDE;
    const bosIdx = best.idx;
    const hIdx = best.h;

    // 2. the zone: top = the swing high, bottom = where the first strong red candle of the drop opened
    const zoneTop = c[hIdx].high;
    let d = -1;
    for (let k = hIdx; k <= bosIdx; k++) {
        if (c[k].close < c[k].open && c[k].open - c[k].close >= 0.4 * a) {
            d = k;
            break;
        }
    }
    let zoneBottom = d >= 0 ? c[d].open : c[Math.min(hIdx + 1, bosIdx)].open;
    zoneBottom = Math.min(zoneBottom, zoneTop - MIN_ZONE_ATR * a);
    zoneBottom = Math.max(zoneBottom, zoneTop - MAX_ZONE_ATR * a);
    const zoneStartIdx = Math.max(0, hIdx - 2);

    // the idea is cancelled by a candle that CLOSES above the zone (a wick is fine)
    let invalidIdx: number | null = null;
    for (let k = bosIdx + 1; k < nc; k++) {
        if (c[k].close > zoneTop) {
            invalidIdx = k;
            break;
        }
    }
    const end = invalidIdx ?? n;

    // 3. the retrace: first candle back into the zone
    let touchIdx: number | null = null;
    for (let k = bosIdx + 1; k < end; k++) {
        if (c[k].high >= zoneBottom) {
            touchIdx = k;
            break;
        }
    }

    // 4. the target: the lowest low of the drop (before the retrace reached the zone)
    let targetIdx = hIdx;
    const tEnd = touchIdx ?? end - 1;
    for (let k = hIdx; k <= tEnd; k++) if (c[k].low < c[targetIdx].low) targetIdx = k;
    const targetPrice = c[targetIdx].low;

    // 4b. point of control of the leg (swing high down to the lowest low): the price level most candles traded through.
    let poc: number | null = null;
    if (targetIdx > hIdx && zoneTop > targetPrice) {
        const BINS = 24;
        const step = (zoneTop - targetPrice) / BINS;
        const hits = new Array<number>(BINS).fill(0);
        for (let k = hIdx; k <= targetIdx; k++) {
            const b0 = Math.max(0, Math.floor((c[k].low - targetPrice) / step));
            const b1 = Math.min(BINS - 1, Math.floor((c[k].high - targetPrice) / step));
            for (let b = b0; b <= b1; b++) hits[b] += 1;
        }
        let best = 0;
        for (let b = 1; b < BINS; b++) if (hits[b] >= hits[best]) best = b; // a tie goes to the higher level (nearer the zone)
        poc = targetPrice + (best + 0.5) * step;
    }
    const nearZone = poc !== null && poc >= zoneBottom - 0.25 * a && poc <= zoneTop + 0.25 * a;

    // 5. sweeps: swing highs formed after the BOS, below the zone, that price later took out
    const swept: Swept[] = [];
    for (const p of highs) {
        if (p <= bosIdx || p >= (touchIdx ?? end) || c[p].high >= zoneBottom) continue;
        for (let k = p + S + 1; k < end; k++) {
            if (c[k].high > c[p].high) {
                swept.push({ idx: p, price: c[p].high, sweepIdx: k });
                break;
            }
        }
    }
    let major: Swept | null = null;
    for (const s of swept) if (!major || s.price > major.price || (s.price === major.price && s.idx > major.idx)) major = s;
    let minor: Swept | null = null;
    for (const s of swept) {
        if (!major || s === major || s.price >= major.price) continue;
        if (!minor || s.idx < minor.idx) minor = s;
    }

    // 5b. before any sweep: the untouched swing highs below the zone are the likely traps (highest = major, an earlier lower one = minor)
    const open: Pivot[] = [];
    for (const p of highs) {
        if (p <= bosIdx || p >= (touchIdx ?? end) || c[p].high >= zoneBottom) continue;
        if (swept.some(s => s.idx === p)) continue;
        open.push({ idx: p, price: c[p].high });
    }
    let watchMajor: Pivot | null = null;
    if (!major) for (const o of open) if (!watchMajor || o.price > watchMajor.price || (o.price === watchMajor.price && o.idx > watchMajor.idx)) watchMajor = o;
    let watchMinor: Pivot | null = null;
    const trap = major ?? watchMajor;
    if (!minor && trap) for (const o of open) if (o.price < trap.price && (!watchMinor || o.idx < watchMinor.idx)) watchMinor = o;

    // 6. MSS: after the sweep and the touch, price makes a swing low; a strong red candle closing below it is the entry
    let mss: Pivot | null = null;
    let weakBreak = false;
    let triggerIdx: number | null = null;
    if (touchIdx !== null && major) {
        const start = Math.max(touchIdx, major.sweepIdx);
        const after = lows.filter(p => p > start);
        const consumed = new Set<number>();
        for (let k = start + 1; k < Math.min(end, nc); k++) {
            let cand: number | null = null;
            for (const p of after) if (p + S <= k && !consumed.has(p) && (cand === null || p > cand)) cand = p;
            if (cand === null) continue;
            mss = { idx: cand, price: c[cand].low };
            if (c[k].close < c[cand].low) {
                if (isStrongRed(c, k)) {
                    triggerIdx = k;
                    break;
                }
                consumed.add(cand);
                weakBreak = true;
            }
        }
        if (triggerIdx === null) {
            // no entry yet: show the swing low that still has to break (if any)
            let cand: number | null = null;
            for (const p of after) if (p + S <= nc - 1 && !consumed.has(p) && (cand === null || p > cand)) cand = p;
            mss = cand === null ? null : { idx: cand, price: c[cand].low };
        }
    }

    let missedIdx: number | null = null;
    if (touchIdx !== null && triggerIdx === null) {
        for (let k = touchIdx + 1; k < end; k++) {
            if (c[k].low < targetPrice) {
                missedIdx = k;
                break;
            }
        }
    }

    // 7. internal liquidity: the swing lows made while price climbed to the zone, nearest below the entry first
    const ref = mss ? mss.price : zoneBottom;
    const ils: Pivot[] = lows
        .filter(p => p > bosIdx && p < (touchIdx ?? end) && c[p].low < ref)
        .map(p => ({ idx: p, price: c[p].low }))
        .sort((x, y) => y.price - x.price)
        .slice(0, 2);

    // 8. the trade
    let entry: number | null = null;
    let stopLoss: number | null = null;
    let takeProfit: number | null = null;
    let outcome: Core['outcome'] = null;
    let ilBroken: (number | null)[] = ils.map(() => null);
    if (touchIdx !== null && (triggerIdx !== null || mss)) {
        const upTo = triggerIdx ?? n - 1;
        let hh = zoneTop;
        for (let k = touchIdx; k <= upTo; k++) hh = Math.max(hh, c[k].high);
        stopLoss = hh + SL_BUFFER_ATR * a;
        takeProfit = targetPrice;
        entry = triggerIdx !== null ? c[triggerIdx].close : (mss as Pivot).price;
    }
    if (triggerIdx !== null && stopLoss !== null && takeProfit !== null) {
        for (let k = triggerIdx + 1; k < n; k++) {
            const stopHit = c[k].high >= stopLoss;
            const tpHit = c[k].low <= takeProfit;
            if (stopHit || tpHit) {
                outcome = { idx: k, kind: stopHit ? 'stop' : 'target' };
                break;
            }
        }
        ilBroken = ils.map(il => {
            for (let k = triggerIdx + 1; k < n; k++) if (c[k].low <= il.price) return k;
            return null;
        });
    }

    return {
        bosIdx, bosLevel: best.level, bosFromIdx: best.from, hIdx, zoneTop, zoneBottom, zoneStartIdx, invalidIdx, touchIdx, missedIdx,
        targetPrice, targetIdx, poc, nearZone, major, minor, watchMajor, watchMinor, mss, weakBreak, triggerIdx, ils, entry, stopLoss, takeProfit, outcome, ilBroken,
    };
}

/**
 * @param candlesRaw closed candles, oldest first
 * @param forming    the candle still forming (used only for the live price)
 * @param now        seconds since epoch (stale-data check); omit to skip it
 */
export function analyseSmc(candlesRaw: Candle[], kind: MarketKind, forming?: Candle | null, now?: number): Analysis {
    void kind;
    const c = candlesRaw.slice(-MAX_CANDLES);
    const last = c.length ? c[c.length - 1] : null;
    const base: Analysis = {
        strategyId: SMC_ID as unknown as SweepStrategyId,
        strategyName: SMC_NAME,
        state: 'no_data',
        statusText: 'No candle data yet',
        range: null,
        sweep: null,
        plan: null,
        lastPrice: forming ? forming.close : last ? last.close : null,
        atr: atr(c),
        warnings: [],
        candlesAnalysed: c.length,
        watch: null,
        candlesSince: null,
        candlesLeft: null,
        sessionNow: last ? sessionAt(last.time) : '',
        lastCandleTime: last ? last.time : null,
        bos: null,
        fvg: null,
        entryTime: null,
        stages: [],
    };
    const stage = (label: string, state: Stage['state'], note?: string): Stage => ({ label, state, note });
    const waiting = (state: SetupState, text: string, warnings: string[] = []): Analysis => ({
        ...base,
        state,
        statusText: text,
        warnings,
        stages: [
            stage('Direction: break of structure (BOS)', 'now', text),
            stage('Zone marked', 'todo'),
            stage('Target marked', 'todo'),
            stage('Price retraces into the zone', 'todo'),
            stage('Liquidity sweep (LS / trap)', 'todo'),
            stage('Market structure shift (MSS)', 'todo'),
            stage('Entry', 'todo'),
        ],
    });
    if (c.length < MIN_CANDLES || !last) {
        return waiting('no_data', 'Not enough candles loaded yet', [`Fewer than ${MIN_CANDLES} candles loaded: not enough to analyse.`]);
    }
    const len = c.length > 1 ? c[c.length - 1].time - c[c.length - 2].time : 0;
    if (now !== undefined && len > 0 && now - (last.time + len) > STALE_AFTER_CANDLES * len) {
        const ageMin = Math.round((now - (last.time + len)) / 60);
        return waiting('stale', `Waiting for fresh data: the newest candle is ${ageMin} min old`, [
            'The market feed is not delivering new candles (market closed or feed problem). Nothing is analysed on old data.',
        ]);
    }
    const a = base.atr;
    if (!a || a <= 0) return waiting('no_data', 'Cannot measure the normal candle size yet');

    // Both directions are looked at. A pullback inside a bearish structure breaks small highs on the way up, so the "latest BOS wins"
    // is wrong: the setup to follow is a live trade first, then an idea still alive, and among those the zone price is closest to.
    // The forming candle is used live only for what a wick can decide (price touched the zone, swept a high, stop or target hit).
    // Everything decided by a CLOSE (break of structure, a candle closing beyond the zone, the MSS entry) waits for the candle to close.
    const live = forming && forming.time > last.time ? forming : null;
    const cs = live ? [...c, live] : c;
    const liveIdx = live ? c.length : null;
    const priceNowReal = forming ? forming.close : last.close;
    const rank = (k: Core, isBuy: boolean): [number, number, number, number] => {
        // an entry whose reward is under the minimum (like 1 : 0.1) is not a trade worth holding the screen for
        const rrOk = k.entry !== null && k.stopLoss !== null && k.takeProfit !== null && k.stopLoss > k.entry && (k.entry - k.takeProfit) / (k.stopLoss - k.entry) >= MIN_RR;
        const finishedRecently = rrOk && k.outcome !== null && cs.length - 1 - k.outcome.idx <= SHOW_FINISHED_CANDLES;
        const live = rrOk && k.triggerIdx !== null && k.outcome === null;
        const alive = k.invalidIdx === null && k.outcome === null && k.missedIdx === null;
        const tier = live || finishedRecently ? 0 : alive ? 1 : 2;
        // an idea that is further along (touched the zone, swept, MSS level formed) is not replaced by a fresh small break
        const progress = (k.touchIdx !== null ? 1 : 0) + (k.major ? 1 : 0) + (k.mss ? 1 : 0);
        const wp = isBuy ? -priceNowReal : priceNowReal;
        const dist = Math.max(0, k.zoneBottom - wp, wp - k.zoneTop) / a;
        return [tier, tier === 1 ? -progress : 0, tier === 0 ? 0 : dist, -k.bosIdx];
    };
    const all: { core: Core; isBuy: boolean; r: [number, number, number, number] }[] = [
        ...scan(cs, a, liveIdx).map(k => ({ core: k, isBuy: false, r: rank(k, false) })),
        ...scan(cs.map(mirror), a, liveIdx).map(k => ({ core: k, isBuy: true, r: rank(k, true) })),
    ];
    all.sort((x, y) => x.r[0] - y.r[0] || x.r[1] - y.r[1] || x.r[2] - y.r[2] || x.r[3] - y.r[3]);
    const pick = all.length ? all[0] : null;
    const buy = pick ? pick.isBuy : false;
    const core = pick ? pick.core : null;
    if (!core) {
        return waiting('waiting_bos', 'Waiting for the direction: no recent break of structure (BOS) on this timeframe yet');
    }

    const sgn = buy ? -1 : 1;
    const R = (m: number) => sgn * m;
    const T = (i: number) => cs[i].time;
    const side: Side = buy ? 'BUY' : 'SELL';
    const zoneName = buy ? 'DEMAND ZONE' : 'SUPPLY ZONE';
    const liqName = buy ? 'BUY SIDE LIQUIDITY' : 'SELL SIDE LIQUIDITY';
    const word = buy ? { up: 'above', down: 'below', high: 'low', low: 'high', red: 'green' } : { up: 'below', down: 'above', high: 'high', low: 'low', red: 'red' };
    const zTop = Math.max(R(core.zoneTop), R(core.zoneBottom));
    const zBottom = Math.min(R(core.zoneTop), R(core.zoneBottom));
    const zoneText = `${px(zBottom)} to ${px(zTop)}`;
    const lastClose = forming ? forming.close : last.close;
    const n = c.length;

    // ---- the trade plan (planned until the MSS entry candle has closed)
    let plan: TradePlan | null = null;
    if (core.entry !== null && core.stopLoss !== null && core.takeProfit !== null) {
        const risk = core.stopLoss - core.entry;
        const reward = core.entry - core.takeProfit;
        if (risk > 0 && reward > 0) {
            plan = {
                planned: core.triggerIdx === null,
                side,
                entry: R(core.entry),
                stopLoss: R(core.stopLoss),
                takeProfit: R(core.takeProfit),
                midpoint: R((core.entry + core.takeProfit) / 2),
                risk,
                reward,
                rr: reward / risk,
            };
        }
    }

    // ---- state
    let state: SetupState;
    let text: string;
    const warnings: string[] = [];
    const entryTime = core.triggerIdx !== null ? T(core.triggerIdx) : null;
    const wp = buy ? -lastClose : lastClose; // current price in the SELL working frame
    if (core.triggerIdx !== null && core.outcome) {
        if (core.outcome.kind === 'target') {
            state = 'target_reached';
            text = `Target reached: price took the ${liqName.toLowerCase()} at ${px(R(core.targetPrice))}`;
        } else {
            state = 'invalidated';
            text = `Stop loss was hit after the entry at ${px(R(core.entry as number))}`;
        }
    } else if (core.triggerIdx !== null && plan) {
        const ran = (core.entry as number) - wp;
        const share = ran / ((core.entry as number) - (core.takeProfit as number));
        if (share > LATE_SHARE) {
            state = 'expired';
            text = `The ${side} entry at ${px(plan.entry)} has passed: price already ran more than half way to the target`;
        } else if (plan.rr < MIN_RR) {
            state = 'poor_market';
            text = `Waiting for the market to be good: reward is only 1 : ${plan.rr.toFixed(2)} (minimum is 1 : ${MIN_RR})`;
            warnings.push(`Reward is only 1 : ${plan.rr.toFixed(2)}, the minimum is 1 : ${MIN_RR}.`);
        } else {
            state = 'ready';
            text = `${side} entry confirmed: a strong ${word.red} candle closed ${word.up} the MSS level ${px(R((core.mss as Pivot).price))}. Hold while price keeps breaking IL-1 / IL-2, target ${px(plan.takeProfit)}`;
        }
    } else if (core.triggerIdx !== null) {
        state = 'poor_market';
        text = 'The entry candle closed, but the stop distance is not usable. Waiting.';
    } else if (core.missedIdx !== null) {
        state = 'expired';
        text = `Price ran to the ${liqName.toLowerCase()} without a valid entry: this setup is over. Waiting for a new break of structure`;
    } else if (core.invalidIdx !== null) {
        state = 'invalidated';
        text = `A candle closed with its body ${word.down} the ${zoneName.toLowerCase()} (${zoneText}): the idea is cancelled. Waiting for a new break of structure`;
    } else if (core.touchIdx === null) {
        state = 'waiting_for_sweep';
        text = `Direction is ${side} (BOS at ${px(R(core.bosLevel))}). ${zoneName} marked ${zoneText}. Waiting for price to come back into the zone`;
    } else if (!core.major) {
        state = 'sweep_in_progress';
        text = `Price reached the ${zoneName.toLowerCase()} but has not swept a previous ${word.high} yet: waiting for the liquidity sweep (LS)`;
    } else if (!core.mss) {
        state = 'sweep_in_progress';
        text = `Sweep done (LS at ${px(R(core.major.price))}). Waiting for price to make a ${word.low} inside the zone, then break it (MSS)`;
    } else {
        state = 'sweep_in_progress';
        text = core.weakBreak
            ? `The MSS level ${px(R(core.mss.price))} was broken without a strong candle: waiting for a strong ${word.red} candle to close ${word.up} it`
            : `Sweep done. Waiting for a strong ${word.red} candle to close ${word.up} the MSS level ${px(R(core.mss.price))}`;
    }

    // ---- stages
    const done = [
        true,
        true,
        true,
        core.touchIdx !== null,
        core.major !== null && core.touchIdx !== null,
        core.triggerIdx !== null,
        core.triggerIdx !== null && state === 'ready',
    ];
    const labels = [
        `Direction: break of structure (BOS) at ${px(R(core.bosLevel))}`,
        `Zone marked: ${zoneName} ${zoneText}`,
        `Target marked: ${liqName} ${px(R(core.targetPrice))}`,
        'Price retraces into the zone',
        'Liquidity sweep (LS / trap) taken',
        'Market structure shift (MSS) with a strong candle',
        'Entry',
    ];
    let nowSet = false;
    const stages: Stage[] = labels.map((label, i) => {
        if (done[i]) return stage(label, 'done');
        if (!nowSet && !['invalidated', 'target_reached', 'expired'].includes(state)) {
            nowSet = true;
            return stage(label, 'now', text);
        }
        return stage(label, 'todo');
    });

    // ---- overlay for the chart (real prices)
    const lineLabel = {
        minor: 'MINOR INDUCEMENT',
        major: 'MAJOR INDUCEMENT ( TRAP )',
    };
    // before the MSS entry exists: show where the entry is expected (the zone), where the idea fails (beyond the zone) and the target
    let area: SmcOverlay['area'] = null;
    if (!plan && core.triggerIdx === null && core.invalidIdx === null && core.missedIdx === null) {
        let hh = core.zoneTop;
        if (core.touchIdx !== null) for (let k = core.touchIdx; k < cs.length; k++) hh = Math.max(hh, cs[k].high);
        const sl = hh + SL_BUFFER_ATR * a;
        if (sl > core.zoneBottom && core.zoneBottom > core.targetPrice) {
            area = { entry: R(core.zoneBottom), stopLoss: R(sl), takeProfit: R(core.targetPrice), fromTime: last.time };
        }
    }
    const overlay: SmcOverlay = {
        key: '',
        side,
        zone: {
            top: zTop,
            bottom: zBottom,
            startTime: T(core.zoneStartIdx),
            label: `${side} ENTRY AREA · ${zoneName} · ${core.touchIdx !== null ? 'MITIGATED' : 'UNMITIGATED'}`,
            touched: core.touchIdx !== null,
        },
        bos: { price: R(core.bosLevel), fromTime: T(core.bosFromIdx), toTime: T(core.bosIdx), label: 'BOS' },
        target: { price: R(core.targetPrice), fromTime: T(core.targetIdx), toTime: null, label: `${liqName} 🎯` },
        minor: core.minor
            ? { price: R(core.minor.price), fromTime: T(core.minor.idx), toTime: T(core.minor.sweepIdx), label: lineLabel.minor }
            : core.watchMinor
              ? { price: R(core.watchMinor.price), fromTime: T(core.watchMinor.idx), toTime: null, label: lineLabel.minor, pending: true }
              : null,
        major: core.major
            ? { price: R(core.major.price), fromTime: T(core.major.idx), toTime: T(core.major.sweepIdx), label: lineLabel.major, sweepTime: T(core.major.sweepIdx) }
            : core.watchMajor
              ? { price: R(core.watchMajor.price), fromTime: T(core.watchMajor.idx), toTime: null, label: lineLabel.major, sweepTime: 0, pending: true }
              : null,
        poc: core.poc !== null ? { price: R(core.poc), fromTime: T(core.hIdx), toTime: null, label: core.nearZone ? 'POC + ZONE' : 'POC', nearZone: core.nearZone } : null,
        mss: core.mss ? { price: R(core.mss.price), fromTime: T(core.mss.idx), toTime: core.triggerIdx !== null ? T(core.triggerIdx) : null, label: 'MSS' } : null,
        internals: core.ils.map((il, i) => ({
            price: R(il.price),
            fromTime: T(il.idx),
            toTime: core.ilBroken[i] !== null ? T(core.ilBroken[i] as number) : null,
            label: `IL-${i + 1}`,
            broken: core.ilBroken[i] !== null,
        })),
        area,
        plan: plan && core.touchIdx !== null ? { entry: plan.entry, stopLoss: plan.stopLoss, takeProfit: plan.takeProfit, fromTime: core.triggerIdx !== null ? T(core.triggerIdx) : last.time, planned: plan.planned === true } : null,
        entryTime,
        exit: core.outcome ? { time: T(core.outcome.idx), kind: core.outcome.kind } : null,
        facts: [
            { label: 'Direction', value: `${side} (break of structure at ${px(R(core.bosLevel))})` },
            { label: zoneName.charAt(0) + zoneName.slice(1).toLowerCase(), value: `${zoneText} (${core.touchIdx !== null ? 'mitigated' : 'unmitigated'})` },
            { label: liqName.charAt(0) + liqName.slice(1).toLowerCase() + ' (target)', value: px(R(core.targetPrice)) },
            ...(core.major ? [{ label: 'Major inducement (trap)', value: `${px(R(core.major.price))}, swept` }] : []),
            ...(core.minor ? [{ label: 'Minor inducement', value: `${px(R(core.minor.price))}, swept` }] : []),
            ...(area ? [{ label: `${side} entry area`, value: `${zoneText}, stop ${px(area.stopLoss)}, target ${px(area.takeProfit)}` }] : []),
            ...(core.poc !== null ? [{ label: 'POC (most-traded price of the drop)', value: `${px(R(core.poc))}${core.nearZone ? ', inside the zone: strongest setup' : ', outside the zone'}` }] : []),
            ...(core.mss ? [{ label: 'MSS level', value: px(R(core.mss.price)) }] : []),
            ...core.ils.map((il, i) => ({ label: `IL-${i + 1} (internal liquidity)`, value: `${px(R(il.price))}${core.ilBroken[i] !== null ? ', broken' : ''}` })),
        ],
    };
    overlay.trend = trendOf(c, side);
    {
        const entryRef = overlay.plan?.entry ?? overlay.area?.entry ?? null;
        const tpRef = overlay.plan?.takeProfit ?? overlay.area?.takeProfit ?? null;
        const pocPx = core.poc !== null ? R(core.poc) : null;
        overlay.partialTp =
            pocPx !== null && entryRef !== null && tpRef !== null && (side === 'SELL' ? pocPx < entryRef && pocPx > tpRef : pocPx > entryRef && pocPx < tpRef) ? pocPx : null;
        overlay.facts.push({
            label: 'Market sentiment',
            value: `${overlay.trend.sentiment}${overlay.trend.sentiment === 'RANGING' ? '' : overlay.trend.withSetup ? ': the setup goes with it' : ': the setup goes against it'}`,
        });
        if (overlay.partialTp !== null) overlay.facts.push({ label: 'First take profit (POC)', value: px(overlay.partialTp) });
    }
    overlay.key = [
        overlay.trend.sentiment, overlay.trend.swings.length, overlay.trend.swings[overlay.trend.swings.length - 1]?.time, overlay.partialTp,
        side, state, overlay.zone.top, overlay.zone.bottom, overlay.zone.touched, overlay.bos.price, overlay.target.price,
        overlay.minor?.price, overlay.minor?.pending, overlay.major?.price, overlay.major?.pending, overlay.poc?.price, overlay.mss?.price, overlay.internals.map(i => `${i.price}${i.broken}`).join(','),
        overlay.plan?.entry, overlay.plan?.stopLoss, overlay.area?.stopLoss, entryTime, overlay.exit?.time, n,
    ].join('|');

    return {
        ...base,
        state,
        statusText: text,
        plan,
        warnings,
        candlesSince: core.triggerIdx !== null ? n - 1 - core.triggerIdx : null,
        bos: { side, level: R(core.bosLevel), swingTime: T(core.bosFromIdx), bosTime: T(core.bosIdx) },
        entryTime,
        stages,
        smc: overlay,
    };
}
