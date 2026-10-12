/**
 * Pure calculation for the Forex Trader tool: no React, no network.
 * Every number the chart draws and every number sent to Gemini comes from here,
 * so the levels are exact. The AI only judges quality and explains.
 *
 * Strategies 1-5 are all "liquidity sweeps": a reference range (Asian session,
 * yesterday, last week, London, New York) has one side broken, price closes
 * back inside, and the trade goes back across the range.
 */

export interface Candle {
    /** Candle open time, seconds since epoch (UTC). */
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export type SweepStrategyId = 1 | 2 | 3 | 4 | 5;
export type MarketKind = 'forex' | 'synthetic' | 'other';
export type Side = 'BUY' | 'SELL';

export type SetupState =
    | 'no_data'
    | 'no_range'
    | 'waiting_for_sweep'
    | 'sweep_in_progress'
    | 'ready'
    | 'invalidated'
    | 'target_reached'
    | 'expired';

export interface RefRange {
    label: string; // e.g. "Asian"
    high: number;
    low: number;
    startTime: number;
    endTime: number; // exclusive end of the range window
    note?: string;
}

export interface Sweep {
    side: 'high' | 'low'; // which side of the range was swept
    firstBreakTime: number;
    confirmTime: number; // candle that closed back inside
    extreme: number; // highest high (high sweep) / lowest low (low sweep) during the sweep
    extremeTime: number;
}

export interface TradePlan {
    side: Side;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    midpoint: number;
    risk: number;
    reward: number;
    rr: number;
}

export interface Analysis {
    strategyId: SweepStrategyId;
    strategyName: string;
    state: SetupState;
    /** Short status shown to the person. */
    statusText: string;
    range: RefRange | null;
    sweep: Sweep | null;
    plan: TradePlan | null;
    lastPrice: number | null;
    atr: number | null;
    warnings: string[];
    candlesAnalysed: number;
}

const DAY = 86400;
const WEEK = 7 * DAY;
/** After the first break, how many candles price may take to close back inside. */
const MAX_CANDLES_TO_CLOSE_BACK = 6;
/** A confirmed setup older than this many candles is treated as expired. */
const SETUP_LIFETIME_CANDLES = 24;

const NAMES: Record<SweepStrategyId, string> = {
    1: 'Asian High/Low sweep',
    2: 'Previous day high/low sweep',
    3: 'Previous week high/low sweep',
    4: 'London session high/low sweep',
    5: 'New York session high/low sweep',
};
const LABELS: Record<SweepStrategyId, string> = {
    1: 'Asian',
    2: 'Prev Day',
    3: 'Prev Week',
    4: 'London',
    5: 'New York',
};
export const strategyLabel = (id: SweepStrategyId) => LABELS[id];

export function marketKind(market: string | undefined): MarketKind {
    const m = (market ?? '').toLowerCase();
    if (m === 'forex' || m === 'commodities') return 'forex';
    if (m === 'synthetic_index' || m === 'derived') return 'synthetic';
    return 'other';
}

export function startOfUtcDay(t: number): number {
    return Math.floor(t / DAY) * DAY;
}
/** Monday 00:00 UTC of the week containing t. (1970-01-01 was a Thursday.) */
export function startOfUtcWeek(t: number): number {
    const d = startOfUtcDay(t);
    const dow = (Math.floor(d / DAY) + 3) % 7; // 0 = Monday
    return d - dow * DAY;
}

export function atr(candles: Candle[], period = 14): number | null {
    if (candles.length < period + 1) return null;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        const c = candles[i];
        const prevClose = candles[i - 1].close;
        sum += Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    }
    return sum / period;
}

function rangeFromWindow(
    candles: Candle[],
    start: number,
    end: number,
    label: string,
    note?: string
): RefRange | null {
    let high = -Infinity;
    let low = Infinity;
    let n = 0;
    for (const c of candles) {
        if (c.time >= start && c.time < end) {
            if (c.high > high) high = c.high;
            if (c.low < low) low = c.low;
            n++;
        }
    }
    if (n === 0 || !isFinite(high) || !isFinite(low)) return null;
    return { label, high, low, startTime: start, endTime: end, note };
}

/** Build the reference range for a strategy from the candles available. */
export function buildRange(
    strategyId: SweepStrategyId,
    candles: Candle[],
    kind: MarketKind
): { range: RefRange | null; reason?: string } {
    if (candles.length === 0) return { range: null, reason: 'No candles loaded.' };
    const last = candles[candles.length - 1];
    const lastT = last.time;
    const day = startOfUtcDay(lastT);
    const label = LABELS[strategyId];

    if (strategyId === 1) {
        if (kind === 'synthetic') {
            // Derived indices have no Asian session: use a rolling 6-hour block that
            // ended 3 hours ago, so there is room afterwards for a sweep to happen.
            const end = lastT - 3 * 3600;
            const start = end - 6 * 3600;
            const r = rangeFromWindow(candles, start, end, label, 'Derived index: no Asian session, using the 6h block that ended 3h ago');
            return r ? { range: r } : { range: null, reason: 'Not enough history for the 6-hour reference block.' };
        }
        // Forex/commodities: 00:00-06:00 GMT. If today's Asian session has not
        // finished yet, use the previous day's.
        let start = day;
        if (lastT < day + 6 * 3600) start = day - DAY;
        const r = rangeFromWindow(candles, start, start + 6 * 3600, label, 'Asian session 00:00-06:00 GMT');
        return r ? { range: r } : { range: null, reason: 'No candles inside the Asian session (00:00-06:00 GMT) yet.' };
    }

    if (strategyId === 2) {
        const r = rangeFromWindow(candles, day - DAY, day, label, "Yesterday's high and low (UTC day)");
        return r ? { range: r } : { range: null, reason: "Yesterday's candles are not in the loaded history." };
    }

    if (strategyId === 3) {
        const week = startOfUtcWeek(lastT);
        const r = rangeFromWindow(candles, week - WEEK, week, label, "Last week's high and low (Mon-Sun UTC)");
        const firstT = candles[0].time;
        if (!r || firstT > week - WEEK + DAY)
            return { range: null, reason: "Last week isn't fully in the loaded history. Use the 5m, 15m or 1h timeframe." };
        return { range: r };
    }

    if (strategyId === 4 || strategyId === 5) {
        const [h1, h2] = strategyId === 4 ? [8, 12] : [13, 17];
        const name = strategyId === 4 ? 'London 08:00-12:00 GMT' : 'New York 13:00-17:00 GMT';
        let start = day + h1 * 3600;
        // Use today's session once it has finished; otherwise the previous day's.
        if (lastT < day + h2 * 3600) start -= DAY;
        const r = rangeFromWindow(candles, start, start + (h2 - h1) * 3600, label, name);
        return r ? { range: r } : { range: null, reason: `No candles inside the ${name} window in the loaded history.` };
    }
    return { range: null, reason: 'Unknown strategy.' };
}

interface SweepScan {
    confirmed: Sweep | null;
    /** A side is currently broken but price has not yet closed back inside. */
    inProgress: { side: 'high' | 'low'; extreme: number } | null;
}

/** Scan candles after the range for the most recent sweep (break + close back inside). */
export function scanSweeps(candles: Candle[], range: RefRange): SweepScan {
    let confirmed: Sweep | null = null;
    let open: { side: 'high' | 'low'; firstBreakTime: number; extreme: number; extremeTime: number; count: number } | null = null;

    for (const c of candles) {
        if (c.time < range.endTime) continue;
        const brokeHigh = c.high > range.high;
        const brokeLow = c.low < range.low;

        if (open) {
            // update the extreme of the running break (a later, higher wick must
            // replace the earlier one -- the stop goes beyond the true extreme)
            if (open.side === 'high' && c.high > open.extreme) {
                open.extreme = c.high;
                open.extremeTime = c.time;
            }
            if (open.side === 'low' && c.low < open.extreme) {
                open.extreme = c.low;
                open.extremeTime = c.time;
            }
            open.count++;
            const closedInside = c.close <= range.high && c.close >= range.low;
            if (closedInside) {
                confirmed = {
                    side: open.side,
                    firstBreakTime: open.firstBreakTime,
                    confirmTime: c.time,
                    extreme: open.extreme,
                    extremeTime: open.extremeTime,
                };
                open = null;
            } else if (open.count > MAX_CANDLES_TO_CLOSE_BACK) {
                // Price kept going: that was a real breakout, not a sweep.
                open = null;
            }
            continue;
        }

        if (brokeHigh && brokeLow) continue; // outside bar on both sides: ambiguous, skip
        if (brokeHigh || brokeLow) {
            const side = brokeHigh ? 'high' : 'low';
            const extreme = brokeHigh ? c.high : c.low;
            const closedInside = c.close <= range.high && c.close >= range.low;
            if (closedInside) {
                // wick-only sweep inside a single candle
                confirmed = { side, firstBreakTime: c.time, confirmTime: c.time, extreme, extremeTime: c.time };
            } else {
                open = { side, firstBreakTime: c.time, extreme, extremeTime: c.time, count: 1 };
            }
        }
    }
    return {
        confirmed,
        inProgress: open ? { side: open.side, extreme: open.extreme } : null,
    };
}

export function analyse(
    strategyId: SweepStrategyId,
    candles: Candle[],
    kind: MarketKind
): Analysis {
    const base: Analysis = {
        strategyId,
        strategyName: NAMES[strategyId],
        state: 'no_data',
        statusText: 'No candle data yet',
        range: null,
        sweep: null,
        plan: null,
        lastPrice: candles.length ? candles[candles.length - 1].close : null,
        atr: atr(candles),
        warnings: [],
        candlesAnalysed: candles.length,
    };
    if (candles.length < 20) {
        base.warnings.push('Fewer than 20 candles loaded: not enough to analyse.');
        return base;
    }

    const { range, reason } = buildRange(strategyId, candles, kind);
    if (!range) {
        return { ...base, state: 'no_range', statusText: 'No reference range yet', warnings: [reason ?? 'No range.'] };
    }
    const out: Analysis = { ...base, range };
    const rangeSize = range.high - range.low;
    if (base.atr && rangeSize < base.atr * 0.8) {
        out.warnings.push('The reference range is very narrow compared with normal movement, so signals from it are less reliable.');
    }

    const { confirmed, inProgress } = scanSweeps(candles, range);
    const lastC = candles[candles.length - 1];

    if (!confirmed) {
        if (inProgress) {
            out.state = 'sweep_in_progress';
            out.statusText = `${inProgress.side === 'high' ? range.label + ' High' : range.label + ' Low'} is being swept: waiting for a candle to close back inside`;
            return out;
        }
        out.state = 'waiting_for_sweep';
        out.statusText = 'Waiting for the point of view: no sweep of the range yet';
        return out;
    }

    out.sweep = confirmed;
    const confirmCandle = candles.find(c => c.time === confirmed.confirmTime)!;
    const pad = (base.atr ?? rangeSize * 0.1) * 0.25;
    const side: Side = confirmed.side === 'high' ? 'SELL' : 'BUY';
    const entry = confirmCandle.close;
    const stopLoss = side === 'SELL' ? confirmed.extreme + pad : confirmed.extreme - pad;
    const takeProfit = side === 'SELL' ? range.low : range.high;
    const risk = Math.abs(stopLoss - entry);
    const reward = Math.abs(entry - takeProfit);
    const plan: TradePlan = {
        side,
        entry,
        stopLoss,
        takeProfit,
        midpoint: (range.high + range.low) / 2,
        risk,
        reward,
        rr: risk > 0 ? reward / risk : 0,
    };
    out.plan = plan;
    if (plan.rr < 1) out.warnings.push(`Reward is smaller than risk (RR ${plan.rr.toFixed(2)}). Many traders skip setups below 1:1.`);

    // What has price done since the confirmation candle?
    let hitSL = false;
    let hitTP = false;
    let candlesSince = 0;
    for (const c of candles) {
        if (c.time <= confirmed.confirmTime) continue;
        candlesSince++;
        if (side === 'SELL') {
            if (c.high >= plan.stopLoss) hitSL = true;
            if (c.low <= plan.takeProfit) hitTP = true;
        } else {
            if (c.low <= plan.stopLoss) hitSL = true;
            if (c.high >= plan.takeProfit) hitTP = true;
        }
        if (hitSL || hitTP) break;
    }

    if (hitSL) {
        out.state = 'invalidated';
        out.statusText = 'Setup invalidated: price went through the stop loss';
        return out;
    }
    if (hitTP) {
        out.state = 'target_reached';
        out.statusText = 'Target already reached: this setup is finished';
        return out;
    }
    if (candlesSince > SETUP_LIFETIME_CANDLES) {
        out.state = 'expired';
        out.statusText = 'Setup expired: the sweep is too old to act on';
        return out;
    }
    // Price already ran more than half-way to the target: the entry is stale.
    const progress = side === 'SELL' ? (plan.entry - lastC.close) / (reward || 1) : (lastC.close - plan.entry) / (reward || 1);
    if (progress > 0.5) out.warnings.push('Price has already moved over half-way to the target since the entry candle, so entering now is late.');
    out.state = 'ready';
    out.statusText = `${side} setup ready`;
    return out;
}
