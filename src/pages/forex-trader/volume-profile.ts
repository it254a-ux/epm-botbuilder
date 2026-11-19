/**
 * Volume profile strategy (the third strategy video): read the sentiment from the swings, then enter from the POC.
 *
 *  1. Swings: rising highs and lows = BULLISH (look for buys); falling highs and lows = BEARISH (look for sells).
 *  2. Drag the volume profile over the latest leg: from the most recent swing low up to the swing high (a SELL: swing high down to swing low).
 *  3. The POC (point of control) is the price where most was traded during that leg.
 *  4. Wait for price to pull back into the POC. When it reacts there (a candle closes back out of it in the trend's direction) enter.
 *  5. Price should then continue in the trend's direction.
 *
 * Deriv candles carry no volume, so the POC is the price where price spent the most time during the leg (same as the Smart money strategy).
 * The video gives no stop or target, so: stop = just beyond the pullback (lowest low of the pullback, under the POC zone for a BUY),
 * target = the leg's own extreme (swing high) extended by 27.2% of the leg. Reward must be at least 1 : MIN_RR to count as ready.
 * Everything is worked out as a BUY; a SELL is the same on mirrored prices.
 */
import { atr, px, sessionAt, MIN_RR, type Analysis, type Candle, type MarketKind, type Side, type SetupState, type Stage, type SweepStrategyId, type TradePlan } from './engine';
import { mirror, pivotHighs, pivotLows, trendOf, SMC_PIVOT_SIDE, type SmcOverlay } from './smc';

export const VP_ID = 35;
export const VP_NAME = 'Volume profile: swing leg + POC pullback';
const MAX_CANDLES = 400;
const MIN_CANDLES = 60;
/** The leg must be at least this many ATR tall (a real move, not a drift). */
const MIN_LEG_ATR = 1.5;
/** The POC zone: the POC plus / minus this many ATR. */
const ZONE_ATR = 0.25;
const SL_BUFFER_ATR = 0.1;
/** The target goes this share of the leg beyond the swing high. */
const EXTENSION = 0.272;
const LEG_MAX_AGE = 150;
const STALE_AFTER_CANDLES = 3;
const LATE_SHARE = 0.5;
const BINS = 24;

interface Leg {
    lowIdx: number;
    highIdx: number;
    low: number;
    high: number;
    poc: number;
    zoneTop: number;
    zoneBottom: number;
    /** Price made a new high before pulling back: the leg is still running. */
    extendedIdx: number | null;
    invalidIdx: number | null;
    touchIdx: number | null;
    triggerIdx: number | null;
    entry: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    outcome: { idx: number; kind: 'target' | 'stop' } | null;
}

/** The latest leg (swing low up to swing high) of BUY-frame candles and what price did after it. */
export function scanLeg(c: Candle[], a: number): Leg | null {
    const hi = pivotHighs(c, SMC_PIVOT_SIDE);
    const lo = pivotLows(c, SMC_PIVOT_SIDE);
    if (!hi.length) return null;
    const highIdx = hi[hi.length - 1];
    if (c.length - 1 - highIdx > LEG_MAX_AGE) return null;
    const high = c[highIdx].high;
    // the start of the leg: the latest swing low before the high that really is the lowest point of the climb, and makes a leg tall enough
    let lowIdx = -1;
    for (let k = lo.length - 1; k >= 0; k--) {
        const i = lo[k];
        if (i >= highIdx) continue;
        let lowest = true;
        for (let j = i; j <= highIdx && lowest; j++) if (c[j].low < c[i].low) lowest = false;
        if (lowest && high - c[i].low >= MIN_LEG_ATR * a) {
            lowIdx = i;
            break;
        }
    }
    if (lowIdx < 0) return null;
    const low = c[lowIdx].low;

    // the POC: the price level most candles of the leg traded through
    const step = (high - low) / BINS;
    const hits = new Array<number>(BINS).fill(0);
    for (let k = lowIdx; k <= highIdx; k++) {
        const b0 = Math.max(0, Math.floor((c[k].low - low) / step));
        const b1 = Math.min(BINS - 1, Math.floor((c[k].high - low) / step));
        for (let b = b0; b <= b1; b++) hits[b] += 1;
    }
    let best = 0;
    for (let b = 1; b < BINS; b++) if (hits[b] >= hits[best]) best = b;
    const poc = low + (best + 0.5) * step;
    const zoneTop = poc + ZONE_ATR * a;
    const zoneBottom = Math.max(low, poc - ZONE_ATR * a);

    const leg: Leg = {
        lowIdx, highIdx, low, high, poc, zoneTop, zoneBottom,
        extendedIdx: null, invalidIdx: null, touchIdx: null, triggerIdx: null, entry: null, stopLoss: null, takeProfit: null, outcome: null,
    };
    const tp = high + EXTENSION * (high - low);
    for (let k = highIdx + 1; k < c.length; k++) {
        const x = c[k];
        if (leg.triggerIdx !== null) {
            // after the entry: the stop first (a candle that hits both counts as a loss), then the target
            if (x.low <= (leg.stopLoss as number)) leg.outcome = { idx: k, kind: 'stop' };
            else if (x.high >= (leg.takeProfit as number)) leg.outcome = { idx: k, kind: 'target' };
            if (leg.outcome) break;
            continue;
        }
        if (leg.touchIdx === null && x.high > high) {
            leg.extendedIdx = k;
            break;
        }
        if (x.close < low) {
            leg.invalidIdx = k;
            break;
        }
        if (leg.touchIdx === null && x.low <= zoneTop) leg.touchIdx = k;
        if (leg.touchIdx !== null && x.low <= zoneTop && x.close > x.open && x.close > poc) {
            let lowest = zoneBottom;
            for (let j = leg.touchIdx; j <= k; j++) lowest = Math.min(lowest, c[j].low);
            const stop = lowest - SL_BUFFER_ATR * a;
            if (x.close > stop && tp > x.close) {
                leg.triggerIdx = k;
                leg.entry = x.close;
                leg.stopLoss = stop;
                leg.takeProfit = tp;
            }
        }
    }
    return leg;
}

export function analyseVolumeProfile(candlesRaw: Candle[], kind: MarketKind, forming?: Candle | null, now?: number): Analysis {
    void kind;
    const c = candlesRaw.slice(-MAX_CANDLES);
    const last = c.length ? c[c.length - 1] : null;
    const base: Analysis = {
        strategyId: VP_ID as unknown as SweepStrategyId,
        strategyName: VP_NAME,
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
            stage('Direction: the swings are rising (buy) or falling (sell)', 'now', text),
            stage('Volume profile drawn over the latest leg', 'todo'),
            stage('POC found', 'todo'),
            stage('Price pulls back into the POC', 'todo'),
            stage('Reaction at the POC', 'todo'),
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

    // 1. the sentiment from the swings: rising = look for buys, falling = look for sells (a SELL is the same thing on mirrored prices)
    const mirrored = c.map(mirror);
    const bull = trendOf(c, 'BUY').sentiment === 'BULLISH';
    const bear = !bull && trendOf(mirrored, 'BUY').sentiment === 'BULLISH';
    if (!bull && !bear) return waiting('waiting_bos', 'Waiting for a clear direction: the swing highs and lows are not both rising (buy) or both falling (sell) yet');
    const buy = bull;
    const side: Side = buy ? 'BUY' : 'SELL';
    const w = buy ? c : mirrored;
    const R = (m: number) => (buy ? m : -m);
    const T = (i: number) => c[i].time;
    const startWord = buy ? 'swing low' : 'swing high';
    const endWord = buy ? 'swing high' : 'swing low';

    const leg = scanLeg(w, a);
    if (!leg) return waiting('waiting_bos', `The direction is ${side}, but there is no clear recent leg (${startWord} to ${endWord}, at least ${MIN_LEG_ATR} x the normal candle) to measure yet`);
    if (leg.extendedIdx !== null) {
        return waiting('waiting_bos', `The direction is ${side}, but price made a new ${endWord} before pulling back: waiting for the new ${endWord} to form`);
    }

    const lastClose = forming ? forming.close : last.close;
    const wp = buy ? lastClose : -lastClose;
    const n = c.length;
    const pocText = px(R(leg.poc));
    const legText = `${startWord} ${px(R(leg.low))} to ${endWord} ${px(R(leg.high))}`;

    // ---- the trade plan (only once the reaction candle has closed)
    let plan: TradePlan | null = null;
    if (leg.triggerIdx !== null && leg.entry !== null && leg.stopLoss !== null && leg.takeProfit !== null) {
        const risk = leg.entry - leg.stopLoss;
        const reward = leg.takeProfit - leg.entry;
        if (risk > 0 && reward > 0) {
            plan = {
                planned: false,
                side,
                entry: R(leg.entry),
                stopLoss: R(leg.stopLoss),
                takeProfit: R(leg.takeProfit),
                midpoint: R((leg.entry + leg.takeProfit) / 2),
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
    if (leg.outcome && plan) {
        if (leg.outcome.kind === 'target') {
            state = 'target_reached';
            text = `Target reached: price continued to ${px(plan.takeProfit)}`;
        } else {
            state = 'invalidated';
            text = `Stop loss was hit after the entry at ${px(plan.entry)}`;
        }
    } else if (plan) {
        const share = (wp - (leg.entry as number)) / ((leg.takeProfit as number) - (leg.entry as number));
        if (share > LATE_SHARE) {
            state = 'expired';
            text = `The ${side} entry at ${px(plan.entry)} has passed: price already ran more than half way to the target`;
        } else if (plan.rr < MIN_RR) {
            state = 'poor_market';
            text = `Waiting for the market to be good: reward is only 1 : ${plan.rr.toFixed(2)} (minimum is 1 : ${MIN_RR})`;
            warnings.push(`Reward is only 1 : ${plan.rr.toFixed(2)}, the minimum is 1 : ${MIN_RR}.`);
        } else {
            state = 'ready';
            text = `${side} entry confirmed: price pulled back to the POC ${pocText} and reacted. Stop ${px(plan.stopLoss)}, target ${px(plan.takeProfit)}`;
        }
    } else if (leg.triggerIdx !== null) {
        state = 'poor_market';
        text = 'The reaction candle closed, but the stop distance is not usable. Waiting.';
    } else if (leg.invalidIdx !== null) {
        state = 'invalidated';
        text = `A candle closed beyond the start of the leg (${px(R(leg.low))}): the idea is cancelled. Waiting for a new leg`;
    } else if (leg.touchIdx === null) {
        state = 'waiting_for_sweep';
        text = `Direction is ${side} (${buy ? 'rising' : 'falling'} swings). Volume profile from ${legText}: POC at ${pocText}. Waiting for price to pull back to the POC`;
    } else {
        state = 'sweep_in_progress';
        text = `Price is at the POC ${pocText}. Waiting for the reaction: a ${buy ? 'green' : 'red'} candle that closes back ${buy ? 'above' : 'below'} the POC`;
    }

    // ---- stages
    const done = [true, true, true, leg.touchIdx !== null, leg.triggerIdx !== null, leg.triggerIdx !== null && state === 'ready'];
    const labels = [
        `Direction: ${buy ? 'rising' : 'falling'} swings, so ${side}`,
        `Volume profile drawn: ${legText}`,
        `POC found at ${pocText}`,
        'Price pulls back into the POC',
        `Reaction at the POC (a ${buy ? 'green' : 'red'} candle closes back out)`,
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

    // ---- the overlay the chart draws
    const tpFar = leg.high + EXTENSION * (leg.high - leg.low);
    let area: SmcOverlay['area'] = null;
    if (!plan && leg.invalidIdx === null && tpFar > leg.poc) {
        area = { entry: R(leg.poc), stopLoss: R(leg.zoneBottom - 0.3 * a), takeProfit: R(tpFar), fromTime: last.time };
    }
    const zTop = Math.max(R(leg.zoneTop), R(leg.zoneBottom));
    const zBottom = Math.min(R(leg.zoneTop), R(leg.zoneBottom));
    const trend = trendOf(c, side);
    const overlay: SmcOverlay = {
        key: '',
        side,
        noHistory: true,
        zone: {
            top: zTop,
            bottom: zBottom,
            startTime: T(leg.highIdx),
            label: `${side} ENTRY AREA · POC ZONE`,
            touched: leg.touchIdx !== null,
        },
        bos: { price: R(leg.low), fromTime: T(leg.lowIdx), toTime: null, label: startWord.toUpperCase() },
        target: { price: R(leg.high), fromTime: T(leg.highIdx), toTime: null, label: `${endWord.toUpperCase()} 🎯` },
        minor: null,
        major: null,
        poc: { price: R(leg.poc), fromTime: T(leg.lowIdx), toTime: null, label: 'POC · MOST TRADED', nearZone: true },
        mss: null,
        internals: [],
        area,
        plan: plan ? { entry: plan.entry, stopLoss: plan.stopLoss, takeProfit: plan.takeProfit, fromTime: T(leg.triggerIdx as number), planned: false } : null,
        entryTime: leg.triggerIdx !== null ? T(leg.triggerIdx) : null,
        exit: leg.outcome ? { time: T(leg.outcome.idx), kind: leg.outcome.kind } : null,
        facts: [
            { label: 'Direction', value: `${side} (${buy ? 'rising' : 'falling'} swing highs and lows)` },
            { label: 'Volume profile leg', value: legText },
            { label: 'POC (most-traded price of the leg)', value: `${pocText} (time at price: Deriv candles carry no volume)` },
            ...(area ? [{ label: `${side} entry area`, value: `POC zone ${px(zBottom)} to ${px(zTop)}, target ${px(area.takeProfit)}` }] : []),
            ...(plan ? [{ label: 'Plan', value: `entry ${px(plan.entry)}, stop ${px(plan.stopLoss)}, target ${px(plan.takeProfit)} (1 : ${plan.rr.toFixed(1)})` }] : []),
            { label: 'Market sentiment', value: `${trend.sentiment}: the setup goes with it` },
        ],
        trend,
        partialTp: null,
    };
    overlay.key = [
        'vp', side, state, leg.lowIdx, leg.highIdx, leg.poc, leg.touchIdx, leg.triggerIdx, leg.outcome?.idx, overlay.plan?.entry, overlay.plan?.stopLoss, trend.swings.length, trend.swings[trend.swings.length - 1]?.time, n,
    ].join('|');

    return {
        ...base,
        state,
        statusText: text,
        plan,
        warnings,
        candlesSince: leg.triggerIdx !== null ? n - 1 - leg.triggerIdx : null,
        bos: { side, level: R(leg.low), swingTime: T(leg.lowIdx), bosTime: T(leg.highIdx) },
        entryTime: overlay.entryTime,
        stages,
        smc: overlay,
    };
}
