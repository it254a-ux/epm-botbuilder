/**
 * The names of the current Smart Money setup, drawn over the chart (not on it): listed one under the other to the right of the last
 * candle, so no candle can cover them and they never overlap. A name that cannot stand on its own line (another name is there) is
 * led back to its line by a sharp red elbow arrow, like the arrows of the videos.
 * It follows the chart every frame (scroll, zoom, price scale), changing the picture only when something moved.
 */
import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import type { SmcLabel } from './smc-draw';

export interface SmcLabelSet {
    /** The time of the last candle: the column of names starts to the right of it. */
    anchor: number;
    items: SmcLabel[];
}

interface Props {
    chart: IChartApi;
    series: ISeriesApi<SeriesType>;
    getLabels: () => SmcLabelSet | null;
}

const RED = '#ff1a1a';
const ROW = 17; // the least distance between two names, in pixels
const CHAR_W = 8.4; // bold 11px, measured on the real chart
const MIN_FONT = 8;
/** The name with a thin dark outline under it (two texts, so every browser draws it the same), so it reads on any candle colour. */
const halo = (x: number, y: number, text: string, color: string, centre: boolean, size: number) => {
    const at = `x="${x}" y="${y}"${centre ? ' dominant-baseline="central"' : ''} font-size="${size}"`;
    return (
        `<text ${at} class="smc-name" fill="#0b0f17" stroke="#0b0f17" stroke-width="3" stroke-linejoin="round">${esc(text)}</text>` +
        `<text ${at} class="smc-name" fill="${color}" stroke="none">${esc(text)}</text>`
    );
};
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pure layout, so it can be tested: the pixel position of each name and of its arrow. */
export function layoutNames(
    items: { y: number; text: string; color: string }[],
    box: { anchorX: number; plotW: number; plotH: number }
): { x: number; y: number; line: number; text: string; color: string; size: number; arrow: { elbowX: number } | null }[] {
    if (items.length === 0) return [];
    const widest = Math.max(...items.map(i => i.text.length)) * CHAR_W;
    // the names start right after the last candle, ON their own lines (which run on to the right), in bold.
    // When the longest name does not fit in the free space, the names get a smaller size (never moved back over the candles).
    const x = Math.max(6, Math.min(box.anchorX + 12, box.plotW - 8 - (widest * MIN_FONT) / 11));
    const free = box.plotW - 8 - x;
    const size = widest <= free ? 11 : Math.max(MIN_FONT, Math.floor((11 * free) / widest));
    const sorted = [...items].sort((a, b) => a.y - b.y);
    const top = 10;
    const bottom = Math.max(top + ROW, box.plotH - 10);
    const ys: number[] = [];
    sorted.forEach((it, k) => ys.push(Math.max(it.y, k === 0 ? top : ys[k - 1] + ROW)));
    // when the column ran off the bottom, push it back up from the end
    for (let k = sorted.length - 1; k >= 0; k--) {
        const limit = k === sorted.length - 1 ? bottom : ys[k + 1] - ROW;
        if (ys[k] > limit) ys[k] = limit;
    }
    let n = 0;
    return sorted.map((it, k) => {
        const moved = Math.abs(ys[k] - it.y) > 7;
        const elbowX = Math.min(box.anchorX + 20 + n * 9, x - 14);
        if (moved) n++;
        return { x, y: ys[k], line: it.y, text: it.text, color: it.color, size, arrow: moved ? { elbowX } : null };
    });
}

const SmcLabels = ({ chart, series, getLabels }: Props) => {
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
                    const ax = ts.timeToCoordinate(set.anchor as Time);
                    const rect = el.getBoundingClientRect();
                    const plotW = ts.width();
                    if (ax !== null && rect.height > 60) {
                        const pts = set.items
                            .map(i => ({ y: series.priceToCoordinate(i.price), text: i.text, color: i.color }))
                            .filter((p): p is { y: number; text: string; color: string } => p.y !== null && p.y > -10 && p.y < rect.height);
                        const placed = layoutNames(pts, { anchorX: ax, plotW, plotH: rect.height - 30 });
                        for (const p of placed) {
                            if (p.arrow) {
                                const up = p.line < p.y;
                                const tip = p.line;
                                const base = up ? tip + 9 : tip - 9;
                                const ex = p.arrow.elbowX;
                                html += `<path d="M ${p.x - 5} ${p.y} H ${ex} V ${base}" fill="none" stroke="${RED}" stroke-width="2.4" stroke-linejoin="miter"/>`;
                                html += `<polygon points="${ex},${tip} ${ex - 6},${base} ${ex + 6},${base}" fill="${RED}"/>`;
                                html += halo(p.x, p.y, p.text, p.color, true, p.size);
                            } else {
                                html += halo(p.x, p.y - 4, p.text, p.color, false, p.size);
                            }
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
    }, [chart, series, getLabels]);
    return <svg ref={svg} className='fx-svg smc-names' aria-hidden />;
};

export default SmcLabels;
