/**
 * The names of the current Smart Money setup, drawn over the chart (not on it).
 *  - A line that runs through the candles gets a thin curly brace in the colour of that line, on the side (above or below) where the
 *    candles leave room, with its name at the point of the brace.
 *  - A line in free space (no candle on it) gets only its name, just under the line, at the right.
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
    getCandles: () => { time: number; high: number; low: number }[];
    /** The writing colour (white on the dark theme, dark on the light theme) and the chart background (for the thin outline). */
    ink: { text: string; bg: string };
}

const CHAR_W = 6.6; // thin 11px, measured on the real chart
const ROW = 14; // the least distance between two names under each other
const BAND = 26; // how far from the line the brace and its name reach, in pixels

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The name with a thin outline under it (two texts, so every browser draws it the same). Only the name is heavier; what comes after " · " is thinner. */
const halo = (x: number, y: number, text: string, color: string, bg: string, anchor: 'middle' | 'end') => {
    const cut = text.indexOf(' · ');
    const body =
        cut < 0 ? esc(text) : `${esc(text.slice(0, cut))}<tspan font-weight="200">${esc(text.slice(cut))}</tspan>`;
    const at = `x="${x}" y="${y}" text-anchor="${anchor}" font-size="11"`;
    return (
        `<text ${at} class="smc-name" fill="${bg}" stroke="${bg}" stroke-width="2" stroke-linejoin="round" text-rendering="geometricPrecision">${body}</text>` +
        `<text ${at} class="smc-name" fill="${color}" stroke="none" text-rendering="geometricPrecision">${body}</text>`
    );
};

/** A curly brace along a line: from x0 to x1, `dir` 1 = under the line (point down), -1 = over it (point up). Two smooth curves that
 *  meet in a point in the middle, with no flat bar (a flat bar would look like a second line). */
export function bracePath(x0: number, x1: number, y: number, dir: 1 | -1, depth = 9): string {
    const m = (x0 + x1) / 2;
    const e = y + dir * 5; // the ends start a little off the line
    const a = e + dir * depth * 0.45;
    const p = e + dir * depth;
    return `M ${x0} ${e} C ${x0} ${a} ${m} ${e} ${m} ${p} C ${m} ${e} ${x1} ${a} ${x1} ${e}`;
}

export interface BraceInput {
    y: number;
    x0: number;
    x1: number;
    text: string;
    /** true = the line runs through candles, so it gets a brace; false = only its name. */
    brace: boolean;
    /** 1 = the free room is below the line, -1 = above it. */
    dir: 1 | -1;
}

export interface BracePlaced {
    index: number;
    brace: boolean;
    dir: 1 | -1;
    x0: number;
    x1: number;
    line: number;
    nameX: number;
    nameY: number;
}

/** Pure layout, so it can be tested: where each brace goes and where its name stands (names that would meet are pushed away from their line). */
export function layoutBraces(items: BraceInput[], box: { plotW: number; plotH: number }): BracePlaced[] {
    const sorted = items
        .map((it, index) => ({ ...it, index, x0: Math.max(4, it.x0), x1: Math.min(box.plotW - 4, it.x1) }))
        .filter(it => it.x1 - it.x0 >= 12)
        .sort((a, b) => a.y - b.y);
    const placed: (BracePlaced & { w: number })[] = [];
    for (const it of sorted) {
        const w = it.text.length * CHAR_W;
        // a line in free space: the name is written at the right end, just under the line
        const nameX = it.brace
            ? Math.max(4 + w / 2, Math.min((it.x0 + it.x1) / 2, box.plotW - 4 - w / 2))
            : box.plotW - 8 - w / 2;
        const dir = it.brace ? it.dir : 1;
        let nameY = it.brace ? it.y + dir * BAND + (dir === 1 ? 4 : 0) : it.y + 12;
        // keep clear of the names already placed that share some of the same width
        for (let again = true; again;) {
            again = false;
            for (const p of placed) {
                if (Math.abs(p.nameX - nameX) < (w + p.w) / 2 && Math.abs(p.nameY - nameY) < ROW) {
                    nameY = p.nameY + dir * ROW;
                    again = true;
                }
            }
        }
        placed.push({
            index: it.index,
            brace: it.brace,
            dir,
            x0: it.x0,
            x1: it.x1,
            line: it.y,
            nameX,
            nameY: Math.max(10, Math.min(nameY, box.plotH - 4)),
            w,
        });
    }
    return placed.map(({ w, ...rest }) => rest);
}

/** Does a line run through candles, and on which side do the candles leave room? (pixel positions; a tie goes above the line) */
export function braceSide(
    y: number,
    candles: { x: number; top: number; bottom: number }[]
): { brace: boolean; dir: 1 | -1 } {
    let crosses = 0;
    let below = 0;
    let above = 0;
    const overlap = (lo: number, hi: number, c: { top: number; bottom: number }) =>
        Math.max(0, Math.min(hi, c.bottom) - Math.max(lo, c.top));
    for (const c of candles) {
        if (c.top <= y && c.bottom >= y) crosses++;
        below += overlap(y, y + BAND, c);
        above += overlap(y - BAND, y, c);
    }
    return { brace: crosses > 0, dir: above <= below ? -1 : 1 };
}

const colourOf = (c: string, ink: string) =>
    /^#?f{3,6}$/i.test(c.replace('#', '')) || /^#?f{2}f{2}f{2}$/i.test(c.replace('#', '')) ? ink : c;

const SmcLabels = ({ chart, series, getLabels, getCandles, ink }: Props) => {
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
                        const candles = getCandles();
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
                        const inputs: BraceInput[] = pts.map(p => {
                            const x0 = p.x0 ?? 0;
                            const x1 = p.x1 ?? plotW;
                            // the candles under this line's own stretch, in pixels
                            const under: { x: number; top: number; bottom: number }[] = [];
                            for (const c of candles) {
                                if (c.time < p.item.t0 || c.time > p.item.t1) continue;
                                const x = ts.timeToCoordinate(c.time as Time);
                                const top = series.priceToCoordinate(c.high);
                                const bottom = series.priceToCoordinate(c.low);
                                if (x !== null && top !== null && bottom !== null && x >= x0 - 2 && x <= x1 + 2)
                                    under.push({ x, top, bottom });
                            }
                            const side = braceSide(p.y, under);
                            return { y: p.y, x0, x1, text: p.item.text, brace: side.brace, dir: side.dir };
                        });
                        const placed = layoutBraces(inputs, { plotW, plotH: rect.height - 30 });
                        for (const p of placed) {
                            const it = pts[p.index].item;
                            if (p.brace) {
                                html += `<path d="${bracePath(p.x0, p.x1, p.line, p.dir)}" fill="none" stroke="${colourOf(it.braceColor, ink.text)}" stroke-width="1.1"/>`;
                            }
                            html += halo(p.nameX, p.nameY, it.text, ink.text, ink.bg, p.brace ? 'middle' : 'end');
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
    }, [chart, series, getLabels, getCandles, ink]);
    return <svg ref={svg} className='fx-svg smc-names' aria-hidden />;
};

export default SmcLabels;
