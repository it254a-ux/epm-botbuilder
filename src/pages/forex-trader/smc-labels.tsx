/**
 * The names of the current Smart Money setup, drawn over the chart (not on it) as plain thin names in the free space, like a professional chart, and only for the key things:
 *  - the names stand in one tidy column in the free space to the right of the last candle, in the order of their lines (so no two
 *    leader lines cross), spaced so that no pill touches another;
 *  - each name is plain thin writing with a short arrow pointing back to its line (the arrow has the colour of the line);
 *  - the writing is thin: white on the dark theme, dark on the light theme.
 * It follows the chart every frame (scroll, zoom, price scale), changing the picture only when something moved.
 */
import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesType, Time } from 'lightweight-charts';
import type { SmcLabel } from './smc-draw';

export interface SmcLabelSet {
    /** The time of the last candle. */
    anchor: number;
    items: SmcLabel[];
}

interface Props {
    chart: IChartApi;
    series: ISeriesApi<SeriesType>;
    getLabels: () => SmcLabelSet | null;
    /** Kept for the callers; the pills no longer depend on the candles. */
    getCandles?: () => { time: number; high: number; low: number }[];
    /** The writing colour (white on the dark theme, dark on the light theme) and the chart background (for the pill). */
    ink: { text: string; bg: string };
}

const CHAR_W = 6.1; // thin 10px caps, a little generous
const PILL_H = 14;
const PILL_GAP = 4;
const PAD = 0;

export interface CalloutInput {
    /** The y of the line the pill belongs to. */
    y: number;
    /** The x where that line ends on screen (the leader line goes there). */
    x1: number;
    text: string;
}

export interface CalloutPlaced {
    index: number;
    x: number;
    y: number;
    w: number;
    h: number;
    /** Where the leader line touches the line, and where it leaves the pill. */
    endX: number;
    endY: number;
}

/** Pure layout, so it can be tested. The pills share one left edge, are listed in the order of their lines and never touch. */
export function layoutCallouts(
    items: CalloutInput[],
    box: { plotW: number; plotH: number; anchorX: number }
): CalloutPlaced[] {
    const sized = items
        .map((it, index) => ({ ...it, index, w: Math.ceil(it.text.length * CHAR_W + PAD * 2) }))
        .sort((a, b) => a.y - b.y);
    if (!sized.length) return [];
    const widest = Math.max(...sized.map(s => s.w));
    // to the right of the last candle when there is room, otherwise as far right as the pills fit
    const x = Math.max(18, Math.min(box.anchorX + 26, box.plotW - widest - 4));
    // top to bottom, each pill as near its own line as it can be without touching the one above
    const ys: number[] = [];
    sized.forEach((s, k) => {
        const want = s.y - PILL_H / 2;
        ys.push(k === 0 ? Math.max(2, want) : Math.max(want, ys[k - 1] + PILL_H + PILL_GAP));
    });
    // if the stack runs off the bottom, push it back up
    const limit = box.plotH - PILL_H - 2;
    for (let k = ys.length - 1; k >= 0; k--) {
        const cap = k === ys.length - 1 ? limit : ys[k + 1] - PILL_H - PILL_GAP;
        if (ys[k] > cap) ys[k] = cap;
    }
    return sized.map((s, k) => ({
        index: s.index,
        x,
        y: ys[k],
        w: s.w,
        h: PILL_H,
        endX: Math.max(2, Math.min(s.x1, x - 8)),
        endY: s.y,
    }));
}

/** A line colour that is white would vanish on the light theme: use the writing colour then. */
const colourOf = (c: string, ink: string) => (/^#?(f{3}|f{6})$/i.test(c.replace('#', '')) ? ink : c);

interface Deps {
    chart: IChartApi;
    series: ISeriesApi<SeriesType>;
    getLabels: () => SmcLabelSet | null;
    ink: () => { text: string; bg: string };
}

/**
 * The names are drawn by the chart itself (a series primitive), in the same paint as the candles. That is what keeps them fixed:
 * they move, zoom and squeeze with the chart on the very same frame, with no lag and no shaking. Each name is placed from its own
 * line's price and from the last candle's time, so it follows them exactly.
 */
class NamesPrimitive {
    private deps: Deps;
    private requestUpdate: (() => void) | null = null;
    private view: { renderer: () => { draw: (target: CanvasTarget) => void } };

    constructor(deps: Deps) {
        this.deps = deps;
        const renderer = { draw: (target: CanvasTarget) => this.draw(target) };
        this.view = { renderer: () => renderer };
    }

    attached(param: { requestUpdate: () => void }) {
        this.requestUpdate = param.requestUpdate;
    }

    detached() {
        this.requestUpdate = null;
    }

    refresh() {
        this.requestUpdate?.();
    }

    updateAllViews() {
        /* everything is worked out while drawing */
    }

    paneViews() {
        return [this.view];
    }

    private draw(target: CanvasTarget) {
        const { chart, series, getLabels } = this.deps;
        const set = getLabels();
        if (!set || !set.items.length) return;
        const ink = this.deps.ink();
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            const ts = chart.timeScale();
            const plotW = mediaSize.width;
            const pts = set.items
                .map(i => ({ item: i, y: series.priceToCoordinate(i.price), x1: ts.timeToCoordinate(i.t1 as Time) }))
                .filter((p): p is typeof p & { y: number } => p.y !== null && p.y > -10 && p.y < mediaSize.height);
            const placed = layoutCallouts(
                pts.map(p => ({ y: p.y, x1: p.x1 ?? plotW, text: p.item.text })),
                { plotW, plotH: mediaSize.height - 4, anchorX: ts.timeToCoordinate(set.anchor as Time) ?? plotW }
            );
            ctx.save();
            ctx.font = "10px 'Jost', sans-serif";
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.lineJoin = 'round';
            for (const p of placed) {
                const it = pts[p.index].item;
                const midY = p.y + p.h / 2;
                // a short arrow pointing back to the line, in the colour of that line
                ctx.strokeStyle = colourOf(it.braceColor, ink.text);
                ctx.lineWidth = 0.9;
                ctx.beginPath();
                ctx.moveTo(p.x - 4, midY);
                ctx.lineTo(p.x - 16, midY);
                ctx.moveTo(p.x - 11, midY - 3);
                ctx.lineTo(p.x - 16, midY);
                ctx.lineTo(p.x - 11, midY + 3);
                ctx.stroke();
                // the name: a thin outline under it keeps it readable over lines and candles
                ctx.strokeStyle = ink.bg;
                ctx.lineWidth = 3;
                ctx.strokeText(it.text, p.x, midY);
                ctx.fillStyle = ink.text;
                ctx.fillText(it.text, p.x, midY);
            }
            ctx.restore();
        });
    }
}

/** The part of the chart's drawing target that is used here. */
interface CanvasTarget {
    useMediaCoordinateSpace: <T>(
        f: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => T
    ) => T;
}

const SmcLabels = ({ chart, series, getLabels, ink }: Props) => {
    const inkRef = useRef(ink);
    const prim = useRef<NamesPrimitive | null>(null);
    inkRef.current = ink;
    useEffect(() => {
        const primitive = new NamesPrimitive({ chart, series, getLabels, ink: () => inkRef.current });
        prim.current = primitive;
        series.attachPrimitive(primitive as unknown as ISeriesPrimitive<Time>);
        // the analysis changes now and then (new candle, new setup): ask for a fresh paint
        const timer = window.setInterval(() => primitive.refresh(), 700);
        return () => {
            window.clearInterval(timer);
            try {
                series.detachPrimitive(primitive as unknown as ISeriesPrimitive<Time>);
            } catch {
                /* the chart is being removed */
            }
            prim.current = null;
        };
    }, [chart, series, getLabels]);
    useEffect(() => {
        prim.current?.refresh();
    }, [ink]);
    return null;
};

export default SmcLabels;
