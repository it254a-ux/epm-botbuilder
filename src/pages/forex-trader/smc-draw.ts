/**
 * Draws the Smart Money markings on the chart, named the way the two videos name them:
 * BOS, SUPPLY / DEMAND ZONE (unmitigated / mitigated), SELL / BUY SIDE LIQUIDITY 🎯, MINOR INDUCEMENT, MAJOR INDUCEMENT ( TRAP ),
 * LS, MSS, IL-1, IL-2 and the trade box (risk above / reward below an entry, flipped for a BUY).
 * Pure drawing: it only reads the overlay that smc.ts calculated.
 */
import type { IChartApi, IPriceLine, ISeriesApi, SeriesMarker, SeriesType, Time, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from './engine';
import type { SmcOverlay } from './smc';

export interface SmcDrawTarget {
    chart: IChartApi;
    series: ISeriesApi<SeriesType>;
    /** Every extra series created here is added to this list, so the chart can remove them on the next redraw. */
    extra: ISeriesApi<SeriesType>[];
    /** Every price line created here is added to this list, for the same reason. */
    lines: IPriceLine[];
}

const C = {
    supplyFill: 'rgba(248,152,136,0.26)',
    supplyEdge: '#f89888',
    supplyText: '#ffd0c8',
    demandFill: 'rgba(112,216,184,0.24)',
    demandEdge: '#70d8b8',
    demandText: '#c8f5e8',
    line: '#cbd5e1',
    lineText: '#f1f5f9',
    bos: '#06b6d4',
    mss: '#f472b6',
    poc: '#e879f9',
    minor: '#94a3b8',
    major: '#f59e0b',
    target: '#fbbf24',
    sweep: '#a855f7',
    broken: '#64748b',
    entry: '#3b82f6',
    sl: '#ef4444',
    tp: '#22c55e',
    riskFill: 'rgba(245,158,11,0.18)',
    rewardFill: 'rgba(45,212,191,0.22)',
    riskFaint: 'rgba(245,158,11,0.08)',
    rewardFaint: 'rgba(45,212,191,0.10)',
};

/** Past setups drawn at most this many at once (each one is about a dozen small series). */
const MAX_HISTORY_DRAWN = 24;

/**
 * @param o       the current setup (null when there is none right now)
 * @param history earlier setups, each already fixed (they end where their own trade ended)
 * @param view    only past setups that touch this time window are drawn, so scrolling back draws more, and the chart stays light
 */
export function drawSmc(
    t: SmcDrawTarget,
    o: SmcOverlay | null,
    candles: Candle[],
    history: SmcOverlay[] = [],
    view?: { from: number; to: number }
): { markers: SeriesMarker<Time>[]; levels: number[] } {
    const { chart, extra, lines } = t;
    const len = candles[candles.length - 1].time - candles[candles.length - 2].time || 900;
    const lastT = candles[candles.length - 1].time;
    const defaultEndT = lastT + len * 8;
    const markers: SeriesMarker<Time>[] = [];
    const levels: number[] = [];

    /** The candle time closest to `time`, so a label always sits on a real candle. */
    const nearest = (time: number) => {
        let best = candles[0].time;
        for (const c of candles) if (Math.abs(c.time - time) < Math.abs(best - time)) best = c.time;
        return best;
    };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    /** A horizontal line from t0 to t1 with its name written on it. */
    const segment = (price: number, t0: number, t1: number, color: string, text: string | null, textColor: string, labelAt: number, opts: { width?: 1 | 2 | 3; dashed?: boolean; hidden?: boolean } = {}) => {
        const to = Math.max(t1, t0 + len);
        const labelT = text ? clamp(nearest(labelAt), t0, to) : t0;
        const times = Array.from(new Set([t0, labelT, to])).sort((a, b) => a - b);
        const s = chart.addLineSeries({
            color: opts.hidden ? 'rgba(0,0,0,0)' : color,
            lineWidth: opts.width ?? 1,
            lineStyle: opts.dashed ? 2 : 0,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
        });
        s.setData(times.map(time => ({ time: time as UTCTimestamp, value: price })));
        if (text) {
            s.setMarkers([{ time: labelT as UTCTimestamp, position: 'inBar', shape: 'circle', size: 0, color: textColor, text }]);
        }
        extra.push(s);
    };
    /** Shaded area between two prices, from t0 to t1. */
    const zone = (t0: number, t1: number, base: number, edge: number, fill: string) => {
        const z = chart.addBaselineSeries({
            baseValue: { type: 'price', price: base },
            topLineColor: 'rgba(0,0,0,0)',
            topFillColor1: fill,
            topFillColor2: fill,
            bottomLineColor: 'rgba(0,0,0,0)',
            bottomFillColor1: fill,
            bottomFillColor2: fill,
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
        });
        z.setData([
            { time: t0 as UTCTimestamp, value: edge },
            { time: t1 as UTCTimestamp, value: edge },
        ]);
        extra.push(z);
    };
    const axisLine = (price: number, title: string, color: string, dashed = false) => {
        lines.push(
            t.series.createPriceLine({ price, color, lineWidth: 2, lineStyle: dashed ? 2 : 0, axisLabelVisible: true, title })
        );
    };

    /** Draws one setup. The current one runs on to the right edge; a past one stops where its own trade stopped. */
    const one = (o: SmcOverlay, main: boolean) => {
        const sell = o.side === 'SELL';
        const endT = o.endTime != null ? o.endTime : defaultEndT;
        const anchor = o.endTime != null ? o.endTime : lastT;
        // ---- the zone (SUPPLY ZONE for a SELL, DEMAND ZONE for a BUY), named UNMITIGATED until price touches it
        const zFill = sell ? C.supplyFill : C.demandFill;
        const zEdge = sell ? C.supplyEdge : C.demandEdge;
        const zText = sell ? C.supplyText : C.demandText;
        zone(o.zone.startTime, endT, o.zone.bottom, o.zone.top, zFill);
        segment(o.zone.top, o.zone.startTime, endT, zEdge, null, zEdge, anchor);
        segment(o.zone.bottom, o.zone.startTime, endT, zEdge, null, zEdge, anchor);
        // an earlier setup is drawn light: its zone, trade box and entry / exit marks only (no names), so old setups never cover the current one
        if (main) segment((o.zone.top + o.zone.bottom) / 2, o.zone.startTime, endT, zEdge, o.zone.label, zText, anchor - len * 14, { hidden: true });

        if (main) {
            // ---- BOS (the swing that was broken, up to the candle that closed through it)
            segment(o.bos.price, o.bos.fromTime, o.bos.toTime ?? anchor, C.bos, o.bos.label, C.bos, ((o.bos.fromTime) + (o.bos.toTime ?? anchor)) / 2, { width: 2 });

            // ---- the target: SELL SIDE LIQUIDITY 🎯 (BUY: BUY SIDE LIQUIDITY 🎯)
            segment(o.target.price, o.target.fromTime, endT, C.target, o.target.label, C.target, anchor - len * 20, { width: 1 });

            // ---- inducements (minor, then the major trap) and the sweep (LS)
            if (o.minor) segment(o.minor.price, o.minor.fromTime, o.minor.toTime ?? anchor, C.minor, o.minor.label, C.lineText, (o.minor.fromTime + (o.minor.toTime ?? anchor)) / 2);
            if (o.major) {
                segment(o.major.price, o.major.fromTime, o.major.toTime ?? anchor, C.major, o.major.label, C.lineText, (o.major.fromTime + (o.major.toTime ?? anchor)) / 2, { width: 2 });
                markers.push({
                    time: nearest(o.major.sweepTime) as UTCTimestamp,
                    position: sell ? 'aboveBar' : 'belowBar',
                    shape: sell ? 'arrowDown' : 'arrowUp',
                    color: C.sweep,
                    text: 'LS',
                });
            }

            // ---- POC: the most-traded price of the drop (the volume-profile idea, measured in time at price). Bold when it sits in the zone.
            if (o.poc) {
                segment(o.poc.price, o.poc.fromTime, endT, C.poc, o.poc.label, C.poc, anchor - len * 6, { width: o.poc.nearZone ? 2 : 1, dashed: !o.poc.nearZone });
                if (main) levels.push(o.poc.price);
            }

            // ---- MSS: the swing low (SELL) / high (BUY) whose break is the confirmation
            if (o.mss) segment(o.mss.price, o.mss.fromTime, o.mss.toTime ?? endT, C.mss, o.mss.label, C.mss, (o.mss.fromTime + (o.mss.toTime ?? anchor)) / 2, { width: 2 });

            // ---- internal liquidity: IL-1 is the nearest to the entry. Once broken the line stops there and turns grey.
            o.internals.forEach(il => {
                segment(il.price, il.fromTime, il.toTime ?? endT, il.broken ? C.broken : C.line, il.broken ? `${il.label} broken` : il.label, il.broken ? C.broken : C.lineText, anchor - len * 10, { dashed: il.broken });
            });
        }

        // ---- the trade box and its price tags
        if (main) levels.push(o.zone.top, o.zone.bottom, o.target.price, o.bos.price);
        if (main && o.mss) levels.push(o.mss.price);
        if (main) o.internals.forEach(i => levels.push(i.price));
        if (o.plan) {
            const p = o.plan;
            const faint = p.planned || !main;
            zone(p.fromTime, endT, p.entry, p.takeProfit, faint ? C.rewardFaint : C.rewardFill);
            zone(p.fromTime, endT, p.entry, p.stopLoss, faint ? C.riskFaint : C.riskFill);
            const rr = Math.abs(p.takeProfit - p.entry) / (Math.abs(p.stopLoss - p.entry) || 1);
            if (main) axisLine(p.entry, faint ? `Entry ${o.side} (planned, on MSS break)` : `ENTRY ${o.side}`, C.entry, faint);
            if (main) axisLine(p.stopLoss, 'SL', C.sl);
            if (main) axisLine(p.takeProfit, `TP · RR 1:${rr.toFixed(1)}`, C.tp);
            if (main) levels.push(p.entry, p.stopLoss, p.takeProfit);
        }
        if (main && !o.plan && o.area) {
            // no entry yet: the zone is where the entry is expected. Faint box = expected reward above/below, expected risk beyond the zone.
            const q = o.area;
            zone(q.fromTime, endT, q.entry, q.takeProfit, C.rewardFaint);
            zone(q.fromTime, endT, q.entry, q.stopLoss, C.riskFaint);
            const rr = Math.abs(q.takeProfit - q.entry) / (Math.abs(q.stopLoss - q.entry) || 1);
            axisLine(q.entry, `${o.side} ENTRY AREA`, C.entry, true);
            axisLine(q.stopLoss, 'SL (idea fails)', C.sl, true);
            axisLine(q.takeProfit, `TP · RR 1:${rr.toFixed(1)}`, C.tp, true);
            levels.push(q.entry, q.stopLoss, q.takeProfit);
        }
        if (o.entryTime !== null) {
            markers.push({
                time: nearest(o.entryTime) as UTCTimestamp,
                position: sell ? 'aboveBar' : 'belowBar',
                shape: sell ? 'arrowDown' : 'arrowUp',
                color: C.entry,
                text: `ENTRY ${o.side}`,
            });
        }
        if (o.exit) {
            markers.push({
                time: nearest(o.exit.time) as UTCTimestamp,
                position: o.exit.kind === 'target' ? (sell ? 'belowBar' : 'aboveBar') : sell ? 'aboveBar' : 'belowBar',
                shape: 'circle',
                color: o.exit.kind === 'target' ? C.tp : C.sl,
                text: o.exit.kind === 'target' ? 'TARGET ✓' : 'SL',
            });
        }
    };

    // past setups first (older underneath), the current one on top
    const from = view ? view.from : -Infinity;
    const to = view ? view.to : Infinity;
    history
        .filter(h => h.zone.startTime <= to && (h.endTime ?? Infinity) >= from)
        .slice(-MAX_HISTORY_DRAWN)
        .forEach(h => one(h, false));
    if (o) one(o, true);
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    return { markers, levels };
}
