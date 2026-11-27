/**
 * The names of the current Smart Money setup, drawn over the chart (not on it): each line has a thin green curly brace under the part
 * of it that exists, and its name under the brace point (names that would meet are pushed down).
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
    /** The writing colour (white on the dark theme, dark on the light theme) and the chart background (for the thin outline). */
    ink: { text: string; bg: string };
}

const GREEN = '#22c55e';
const CHAR_W = 6.6; // thin 11px, measured on the real chart
const ROW = 15; // the least distance between two names under each other
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The name with a thin dark outline under it (two texts, so every browser draws it the same). Only the name is heavier; what comes after " · " is thinner. */
const halo = (x: number, y: number, text: string, color: string, bg: string) => {
    const cut = text.indexOf(' · ');
    const body =
        cut < 0 ? esc(text) : `${esc(text.slice(0, cut))}<tspan font-weight="200">${esc(text.slice(cut))}</tspan>`;
    const at = `x="${x}" y="${y}" text-anchor="middle" font-size="11"`;
    return (
        `<text ${at} class="smc-name" fill="${bg}" stroke="${bg}" stroke-width="2" stroke-linejoin="round" text-rendering="geometricPrecision">${body}</text>` +
        `<text ${at} class="smc-name" fill="${color}" stroke="none" text-rendering="geometricPrecision">${body}</text>`
    );
};

/** A curly brace under a line: from x0 to x1, at height y, bulging down, with its point at the middle. */
export function bracePath(x0: number, x1: number, y: number, depth = 6): string {
    const m = (x0 + x1) / 2;
    const r = Math.min(depth, (x1 - x0) / 4);
    return `M ${x0} ${y - 3} Q ${x0} ${y + 2} ${x0 + r} ${y + 2} L ${m - r} ${y + 2} Q ${m} ${y + 2} ${m} ${y + depth + 1} Q ${m} ${y + 2} ${m + r} ${y + 2} L ${x1 - r} ${y + 2} Q ${x1} ${y + 2} ${x1} ${y - 3}`;
}

/** Pure layout, so it can be tested: where each brace goes and where its name stands (names that would meet are pushed down). */
export function layoutBraces(
    items: { y: number; x0: number; x1: number; text: string }[],
    box: { plotW: number; plotH: number }
): { index: number; x0: number; x1: number; line: number; nameX: number; nameY: number }[] {
    const sorted = items
        .map((it, index) => ({ ...it, index, x0: Math.max(4, it.x0), x1: Math.min(box.plotW - 4, it.x1) }))
        .filter(it => it.x1 - it.x0 >= 12)
        .sort((a, b) => a.y - b.y);
    const placed: { index: number; x0: number; x1: number; line: number; nameX: number; nameY: number; w: number }[] =
        [];
    for (const it of sorted) {
        const w = it.text.length * CHAR_W;
        const nameX = Math.max(4 + w / 2, Math.min((it.x0 + it.x1) / 2, box.plotW - 4 - w / 2));
        let nameY = it.y + 20;
        // keep clear of the names already placed that share some of the same width
        for (let again = true; again;) {
            again = false;
            for (const p of placed) {
                if (Math.abs(p.nameX - nameX) < (w + p.w) / 2 && Math.abs(p.nameY - nameY) < ROW) {
                    nameY = p.nameY + ROW;
                    again = true;
                }
            }
        }
        placed.push({
            index: it.index,
            x0: it.x0,
            x1: it.x1,
            line: it.y,
            nameX,
            nameY: Math.min(nameY, box.plotH - 4),
            w,
        });
    }
    return placed.map(({ w, ...rest }) => rest);
}

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
                                x0: ts.timeToCoordinate(i.t0 as Time),
                                x1: ts.timeToCoordinate(i.t1 as Time),
                            }))
                            .filter(
                                (p): p is typeof p & { y: number } => p.y !== null && p.y > -10 && p.y < rect.height
                            );
                        const placed = layoutBraces(
                            pts.map(p => ({ y: p.y, x0: p.x0 ?? 0, x1: p.x1 ?? plotW, text: p.item.text })),
                            { plotW, plotH: rect.height - 30 }
                        );
                        for (const p of placed) {
                            const it = pts[p.index].item;
                            html += `<path d="${bracePath(p.x0, p.x1, p.line + 5)}" fill="none" stroke="${GREEN}" stroke-width="1.2"/>`;
                            html += halo(p.nameX, p.nameY, it.text, ink.text, ink.bg);
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
