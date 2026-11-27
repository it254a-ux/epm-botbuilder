/**
 * The names of the current Smart Money setup, drawn over the chart (not on it) as plain thin names in the free space, like a professional chart, and only for the key things:
 *  - the names stand in one tidy column in the free space to the right of the last candle, in the order of their lines (so no two
 *    leader lines cross), spaced so that no pill touches another;
 *  - each name is plain thin writing with a short arrow pointing back to its line (the arrow has the colour of the line);
 *  - the writing is thin: white on the dark theme, dark on the light theme.
 * It follows the chart every frame (scroll, zoom, price scale), changing the picture only when something moved.
 */
import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
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

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

const SmcLabels = ({ chart, series, getLabels, ink }: Props) => {
    const svg = useRef<SVGSVGElement>(null);
    useEffect(() => {
        let raf = 0;
        let last = '';
        const loop = () => {
            raf = requestAnimationFrame(loop);
            const el = svg.current;
            if (!el) return;
            let html = '';
            try {
                const set = getLabels();
                if (set && set.items.length) {
                    const ts = chart.timeScale();
                    const rect = el.getBoundingClientRect();
                    const plotW = ts.width();
                    if (rect.height > 60) {
                        const pts = set.items
                            .map(i => ({
                                item: i,
                                y: series.priceToCoordinate(i.price),
                                x1: ts.timeToCoordinate(i.t1 as Time),
                            }))
                            .filter(
                                (p): p is typeof p & { y: number } => p.y !== null && p.y > -10 && p.y < rect.height
                            );
                        const placed = layoutCallouts(
                            pts.map(p => ({ y: p.y, x1: p.x1 ?? plotW, text: p.item.text })),
                            {
                                plotW,
                                plotH: rect.height - 30,
                                anchorX: ts.timeToCoordinate(set.anchor as Time) ?? plotW,
                            }
                        );
                        for (const p of placed) {
                            const it = pts[p.index].item;
                            const col = colourOf(it.braceColor, ink.text);
                            const midY = p.y + p.h / 2;
                            // a short arrow pointing back to the line, then the name: plain thin writing, no box
                            html += `<path d="M ${p.x - 4} ${midY} L ${p.x - 16} ${midY} M ${p.x - 11} ${midY - 3} L ${p.x - 16} ${midY} L ${p.x - 11} ${midY + 3}" fill="none" stroke="${col}" stroke-width="0.9"/>`;
                            // one piece of writing (an outline copy under it keeps it readable over lines and candles)
                            const at = `x="${p.x}" y="${midY}" dominant-baseline="central" font-size="10" class="smc-name"`;
                            html += `<text ${at} fill="${ink.bg}" stroke="${ink.bg}" stroke-width="3" stroke-linejoin="round">${esc(it.text)}</text>`;
                            html += `<text ${at} fill="${ink.text}">${esc(it.text)}</text>`;
                        }
                    }
                }
            } catch {
                /* the chart is being removed */
            }
            if (html !== last) {
                last = html;
                el.innerHTML = html;
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [chart, series, getLabels, ink]);
    return <svg ref={svg} className='fx-svg smc-names' aria-hidden />;
};

export default SmcLabels;
