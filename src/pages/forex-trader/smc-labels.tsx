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
const CHAR_W = 5.4;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pure layout, so it can be tested: the pixel position of each name and of its arrow. */
export function layoutNames(
    items: { y: number; text: string; color: string }[],
    box: { anchorX: number; plotW: number; plotH: number }
): { x: number; y: number; line: number; text: string; color: string; arrow: { elbowX: number } | null }[] {
    if (items.length === 0) return [];
    const widest = Math.max(...items.map(i => i.text.length)) * CHAR_W;
    const x = Math.max(6, Math.min(box.anchorX + 96, box.plotW - 8 - widest));
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
        return { x, y: ys[k], line: it.y, text: it.text, color: it.color, arrow: moved ? { elbowX } : null };
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
                                html += `<text x="${p.x}" y="${p.y}" dominant-baseline="central" fill="${p.color}" class="smc-name">${esc(p.text)}</text>`;
                            } else {
                                html += `<text x="${p.x}" y="${p.y - 4}" fill="${p.color}" class="smc-name">${esc(p.text)}</text>`;
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
