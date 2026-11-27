/**
 * The names of the current Smart Money setup, drawn over the chart (not on it) as plain thin names in the free space, like a professional chart, and only for the key things:
 *  - a key line or level is highlighted by a thin box along it with its name inside, like the Smart Money teaching charts; the zone's
 *    name is written inside the zone's own shading;
 *  - boxes that would meet are moved apart;
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
    /** The y of the line (or of the middle of the zone) the name belongs to. */
    y: number;
    /** Where that line or zone starts and ends on screen. */
    x0: number;
    x1: number;
    text: string;
    /** true = a thin highlight box on the line with the name inside; false = only the name, inside the zone's own shading. */
    box: boolean;
}

export interface CalloutPlaced {
    index: number;
    box: boolean;
    /** The highlight box (for a name without a box: the space the writing takes). */
    x: number;
    w: number;
    /** The y of the middle of the box. */
    y: number;
    h: number;
}

/**
 * Pure layout, so it can be tested. Like the Smart Money teaching charts: a key level is highlighted by a thin box along it, and the
 * name is written inside the box. The box is as long as the line (or just long enough for the name, from the start of a short line).
 * The zone has its own shading, so its name is simply written inside it. Boxes that would meet are moved apart, downwards.
 */
export function layoutCallouts(items: CalloutInput[], box: { plotW: number; plotH: number }): CalloutPlaced[] {
    const sized = items
        .map((it, index) => {
            const tw = Math.ceil(it.text.length * CHAR_W);
            const x0 = Math.max(0, it.x0);
            const x1 = Math.min(box.plotW, it.x1);
            const need = tw + 14;
            let x: number;
            let w: number;
            if (!it.box) {
                // the zone: the name in the middle of the part of the zone that can be seen
                w = tw;
                x = Math.max(4, Math.min((x0 + x1) / 2 - tw / 2, box.plotW - tw - 4));
            } else if (x1 - x0 >= need) {
                x = x0;
                w = x1 - x0;
            } else {
                // a short line: the box starts with the line and is long enough for the name
                w = need;
                x = Math.max(2, Math.min(x0, box.plotW - need - 2));
            }
            return { ...it, index, x, w };
        })
        .filter(it => it.x1 > 0 && it.x0 < box.plotW)
        .sort((a, b) => a.y - b.y);
    const placed: CalloutPlaced[] = [];
    for (const it of sized) {
        let y = it.y;
        for (let again = true; again;) {
            again = false;
            for (const p of placed) {
                if (it.x < p.x + p.w + 2 && p.x < it.x + it.w + 2 && Math.abs(p.y - y) < PILL_H + 2) {
                    y = p.y + PILL_H + 2;
                    again = true;
                }
            }
        }
        placed.push({
            index: it.index,
            box: it.box,
            x: it.x,
            w: it.w,
            y: Math.max(PILL_H / 2, Math.min(y, box.plotH - PILL_H / 2)),
            h: PILL_H,
        });
    }
    return placed;
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
                .map(i => ({
                    item: i,
                    y: series.priceToCoordinate(i.price),
                    x0: ts.timeToCoordinate(i.t0 as Time),
                    x1: ts.timeToCoordinate(i.t1 as Time),
                }))
                .filter((p): p is typeof p & { y: number } => p.y !== null && p.y > -10 && p.y < mediaSize.height);
            const placed = layoutCallouts(
                pts.map(p => ({ y: p.y, x0: p.x0 ?? 0, x1: p.x1 ?? plotW, text: p.item.text, box: p.item.box })),
                { plotW, plotH: mediaSize.height - 4 }
            );
            ctx.save();
            ctx.font = "10px 'Jost', sans-serif";
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.lineJoin = 'round';
            for (const p of placed) {
                const it = pts[p.index].item;
                const midY = p.y;
                const col = colourOf(it.braceColor, ink.text);
                if (p.box) {
                    // the highlight box on the line, with the name inside it
                    ctx.fillStyle = ink.bg;
                    ctx.globalAlpha = 0.88;
                    ctx.fillRect(p.x, midY - p.h / 2, p.w, p.h);
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = col;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(p.x + 0.5, midY - p.h / 2 + 0.5, p.w - 1, p.h - 1);
                    ctx.textAlign = 'center';
                    ctx.fillStyle = ink.text;
                    ctx.fillText(it.text, p.x + p.w / 2, midY + 0.5);
                } else {
                    // the zone's name inside its own shading (a thin outline keeps it readable)
                    ctx.textAlign = 'left';
                    ctx.strokeStyle = ink.bg;
                    ctx.lineWidth = 3;
                    ctx.strokeText(it.text, p.x, midY);
                    ctx.fillStyle = ink.text;
                    ctx.fillText(it.text, p.x, midY);
                }
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
