import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
    createChart,
    type CandlestickData,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type SeriesMarker,
    type SeriesType,
    type Time,
    type LineData,
    type UTCTimestamp,
} from 'lightweight-charts';
import type { Analysis, Candle } from './engine';
import { strategyLabel } from './engine';
import ChartDrawings from './chart-drawings';
import type { PdhResult } from './pdh';

export interface ChartViewHandle {
    /** Replace all candles (initial load / market or timeframe change). */
    setCandles: (candles: Candle[]) => void;
    /** Fold candles into the ones already shown (after a reconnect): fills any gap and keeps the drawings and the zoom. */
    mergeCandles: (candles: Candle[]) => void;
    /** Add or update the newest candle (live stream). */
    updateCandle: (candle: Candle) => void;
    /** Draw (or clear, with null) the named lines for an analysis. */
    drawAnalysis: (analysis: Analysis | null, candles: Candle[]) => void;
    /** Draw (or clear, with null) the Previous Day High/Low picture: levels, named arrows, and the trade plan. */
    drawPdh: (result: PdhResult | null) => void;
    /** Draw (or clear, with an empty list) plain price lines owned by a parent page, such as open trades. They stay when the analysis is redrawn. */
    drawLines: (lines: { key: string; title: string; price: number; color: string }[]) => void;
    /** JPEG data URL of the chart as it looks right now, or null. */
    screenshot: () => string | null;
}

interface Props {
    pipSize: number;
}

const COLORS = {
    range: '#f59e0b',
    mid: '#9ca3af',
    entry: '#3b82f6',
    sl: '#ef4444',
    tp: '#22c55e',
    path: '#eab308',
    sweep: '#a855f7',
    bos: '#06b6d4',
    fvg: '#a855f7',
    fvgFill: 'rgba(168,85,247,0.20)',
    rewardFill: 'rgba(34,197,94,0.20)',
    riskFill: 'rgba(239,68,68,0.20)',
    rewardFaint: 'rgba(34,197,94,0.09)',
    riskFaint: 'rgba(239,68,68,0.09)',
    asian: 'rgba(139,92,246,0.10)',
    london: 'rgba(59,130,246,0.10)',
    ny: 'rgba(249,115,22,0.09)',
};

/** Turns any CSS colour (hex, rgb, a variable's value) into [r, g, b], or null. */
function toRgb(host: HTMLElement, css: string): [number, number, number] | null {
    if (!css) return null;
    const probe = document.createElement('span');
    probe.style.color = css.trim();
    host.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    host.removeChild(probe);
    return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : null;
}

interface Theme {
    bg: string;
    text: string;
    grid: string;
    border: string;
    font: string;
}

/** Reads the website's own colours and font, so the chart always matches the page (dark or light). */
function readTheme(host: HTMLElement): Theme {
    const cs = getComputedStyle(host);
    const dark = isDarkTheme(host);
    const bgRgb = toRgb(host, cs.getPropertyValue('--general-main-1'));
    const textRgb = toRgb(host, cs.getPropertyValue('--text-general'));
    const borderRgb = toRgb(host, cs.getPropertyValue('--border-normal'));
    const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    return {
        bg: bgRgb ? rgb(bgRgb) : dark ? '#0e1116' : '#ffffff',
        text: textRgb ? rgb(textRgb) : dark ? '#c7cdd6' : '#374151',
        grid: borderRgb ? rgb(borderRgb, 0.45) : dark ? '#1b2029' : '#eef0f3',
        border: borderRgb ? rgb(borderRgb) : dark ? '#2a303b' : '#d9dde3',
        font: cs.fontFamily || 'sans-serif',
    };
}

function isDarkTheme(el: HTMLElement): boolean {
    const m = getComputedStyle(el).color.match(/\d+/g);
    if (!m) return true;
    const [r, g, b] = m.map(Number);
    // light text colour = dark theme
    return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

const toBar = (c: Candle): CandlestickData => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
});

const ChartView = forwardRef<ChartViewHandle, Props>(function ChartView({ pipSize }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const linesRef = useRef<IPriceLine[]>([]);
    const extraRef = useRef<ISeriesApi<SeriesType>[]>([]);
    // lines a parent page asks for (open trades): kept apart from the analysis drawing so redrawing one never erases the other
    const parentLinesRef = useRef<IPriceLine[]>([]);
    const levelsRef = useRef<{ min: number; max: number } | null>(null);
    // candles kept here so the drawing tools' magnet can snap to them
    const candlesRef = useRef<Candle[]>([]);
    const [apis, setApis] = useState<{ chart: IChartApi; series: ISeriesApi<'Candlestick'> } | null>(null);
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const th = readTheme(host);
        const themeOptions = (t: Theme) => ({
            layout: { background: { color: t.bg }, textColor: t.text, fontSize: 11, fontFamily: t.font },
            grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
            rightPriceScale: { borderColor: t.border },
            timeScale: { borderColor: t.border },
        });
        const chart = createChart(host, {
            width: host.clientWidth,
            height: host.clientHeight,
            ...themeOptions(th),
            timeScale: { borderColor: th.border, timeVisible: true, secondsVisible: false },
            crosshair: { mode: 0 },
        });
        // Follow the website when its theme (dark / light) is switched.
        const themeWatch = new MutationObserver(() => chart.applyOptions(themeOptions(readTheme(host))));
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
        themeWatch.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
        const series = chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderUpColor: '#22c55e',
            borderDownColor: '#ef4444',
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });
        // Keep every drawn level (SL/TP, planned lines) inside the visible price range.
        series.applyOptions({
            autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null; margins?: unknown } | null) => {
                const res = original();
                const lv = levelsRef.current;
                if (!res || !res.priceRange || !lv) return res;
                return {
                    ...res,
                    priceRange: {
                        minValue: Math.min(res.priceRange.minValue, lv.min),
                        maxValue: Math.max(res.priceRange.maxValue, lv.max),
                    },
                };
            },
        } as never);
        chartRef.current = chart;
        seriesRef.current = series;
        setApis({ chart, series });

        const ro = new ResizeObserver(() => {
            if (host.clientWidth > 0 && host.clientHeight > 0) {
                chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
            }
        });
        ro.observe(host);
        return () => {
            themeWatch.disconnect();
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
            setApis(null);
            linesRef.current = [];
            extraRef.current = [];
            parentLinesRef.current = [];
        };
    }, []);

    useEffect(() => {
        const minMove = Math.pow(10, -pipSize);
        seriesRef.current?.applyOptions({ priceFormat: { type: 'price', precision: pipSize, minMove } });
    }, [pipSize]);

    const clearDrawing = () => {
        const series = seriesRef.current;
        const chart = chartRef.current;
        if (series) linesRef.current.forEach(l => series.removePriceLine(l));
        linesRef.current = [];
        if (chart) extraRef.current.forEach(s => chart.removeSeries(s));
        extraRef.current = [];
        series?.setMarkers([]);
        levelsRef.current = null;
    };

    useImperativeHandle(ref, () => {
      const impl: ChartViewHandle = {
        setCandles(candles) {
            clearDrawing();
            candlesRef.current = candles.slice();
            setResetKey(k => k + 1);
            seriesRef.current?.setData(candles.map(toBar));
            chartRef.current?.timeScale().fitContent();
        },
        mergeCandles(candles) {
            const byTime = new Map<number, Candle>();
            candlesRef.current.forEach(c => byTime.set(c.time, c));
            candles.forEach(c => byTime.set(c.time, c));
            const merged = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
            candlesRef.current = merged;
            // keep the zoom and position the person is looking at
            const ts = chartRef.current?.timeScale();
            const range = ts?.getVisibleLogicalRange() ?? null;
            seriesRef.current?.setData(merged.map(toBar));
            if (ts && range) ts.setVisibleLogicalRange(range);
        },
        drawLines(lines) {
            const series = seriesRef.current;
            if (!series) return;
            parentLinesRef.current.forEach(l => series.removePriceLine(l));
            parentLinesRef.current = lines
                .filter(l => Number.isFinite(l.price))
                .map(l =>
                    series.createPriceLine({ price: l.price, color: l.color, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: l.title })
                );
        },
        updateCandle(candle) {
            const list = candlesRef.current;
            const last = list[list.length - 1];
            if (last && last.time === candle.time) list[list.length - 1] = candle;
            else if (!last || candle.time > last.time) list.push(candle);
            seriesRef.current?.update(toBar(candle));
        },
        drawPdh(result) {
            const series = seriesRef.current;
            clearDrawing();
            if (!series || !result) return;
            const addLine = (price: number, title: string, color: string, dashed = false, width: 1 | 2 = 2) => {
                linesRef.current.push(series.createPriceLine({ price, color, lineWidth: width, lineStyle: dashed ? 2 : 0, axisLabelVisible: true, title }));
            };
            const lv = result.levels;
            if (lv.high !== null) addLine(lv.high, 'Previous Day High', '#f0b429');
            if (lv.low !== null) addLine(lv.low, 'Previous Day Low', '#f0b429');
            if (lv.equilibrium !== null) addLine(lv.equilibrium, 'Equilibrium (50%)', '#94a3b8', true, 1);
            const plan = result.plan;
            if (plan) {
                addLine(plan.entry, `ENTRY ${plan.side}`, '#38bdf8');
                addLine(plan.stopLoss, 'Stop Loss', '#ef4444');
                addLine(plan.takeProfit, 'Target 1 (Equilibrium)', '#22c55e');
                addLine(plan.takeProfit2, 'Target 2', '#22c55e', true, 1);
            }
            const buy = result.side === 'BUY';
            const markers: SeriesMarker<Time>[] = result.markers.map(m => {
                const color = m.kind === 'footprint' ? '#f59e0b' : m.kind === 'sweep' ? '#a78bfa' : buy ? '#22c55e' : '#ef4444';
                const shape = m.kind === 'footprint' ? 'circle' : m.above ? 'arrowDown' : 'arrowUp';
                return { time: m.time as UTCTimestamp, position: m.above ? 'aboveBar' : 'belowBar', color, shape, text: m.text };
            });
            markers.sort((a, b) => (a.time as number) - (b.time as number));
            series.setMarkers(markers);
            // keep the active level and the plan inside the visible price range
            const vals: number[] = [];
            if (result.levelPrice !== null) vals.push(result.levelPrice);
            if (plan) vals.push(plan.entry, plan.stopLoss, plan.takeProfit);
            if (vals.length) {
                const span = Math.max(...vals) - Math.min(...vals) || Math.abs(vals[0]) * 0.001;
                levelsRef.current = { min: Math.min(...vals) - span * 0.06, max: Math.max(...vals) + span * 0.06 };
            }
        },
        drawAnalysis(analysis, candles) {
            const series = seriesRef.current;
            const chart = chartRef.current;
            clearDrawing();
            if (!series || !chart || !analysis || candles.length < 3) return;

            const len = candles[candles.length - 1].time - candles[candles.length - 2].time || 900;
            const lastT = candles[candles.length - 1].time;
            const endT = (lastT + len * 8) as UTCTimestamp;

            const addLine = (price: number, title: string, color: string, dashed = false, width: 1 | 2 = 2) => {
                linesRef.current.push(
                    series.createPriceLine({
                        price,
                        color,
                        lineWidth: width,
                        lineStyle: dashed ? 2 : 0,
                        axisLabelVisible: true,
                        title,
                    })
                );
            };
            const addSegment = (t0: number, t1: number, price: number, color: string, width: 1 | 2 | 3 = 2, dashed = false) => {
                const s = chart.addLineSeries({
                    color,
                    lineWidth: width,
                    lineStyle: dashed ? 2 : 0,
                    lastValueVisible: false,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                });
                s.setData([
                    { time: t0 as UTCTimestamp, value: price },
                    { time: t1 as UTCTimestamp, value: price },
                ]);
                extraRef.current.push(s);
            };
            /** Shaded zone between `base` and `edge`, from t0 to t1. */
            const addZone = (t0: number, t1: number, base: number, edge: number, fill: string) => {
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
                extraRef.current.push(z);
            };

            // ---- session bands (Asian / London / New York): one continuous soft shade per session
            const sessionOf = (t: number) => {
                const h = new Date(t * 1000).getUTCHours();
                return h < 7 ? 'asian' : h < 13 ? 'london' : h < 21 ? 'ny' : null;
            };
            const recent = candles.filter(c => c.time > lastT - 3 * 86400);
            (['asian', 'london', 'ny'] as const).forEach(name => {
                const shade = COLORS[name];
                const area = chart.addAreaSeries({
                    priceScaleId: 'sess',
                    lineVisible: false,
                    topColor: shade,
                    bottomColor: shade,
                    lastValueVisible: false,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                });
                // a fixed 0..1 scale, so the shade always fills the full height of the chart
                area.applyOptions({
                    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
                } as never);
                // set after the series exists (before that the scale does not exist yet and the margins were ignored, leaving the shade short)
                area.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
                // candles outside this session are blank points, so the shade stops there
                area.setData(
                    recent.map(c => (sessionOf(c.time) === name ? { time: c.time as UTCTimestamp, value: 1 } : { time: c.time as UTCTimestamp }))
                );
                extraRef.current.push(area);
            });

            const markers: SeriesMarker<Time>[] = [];
            const plan = analysis.plan;
            const r = analysis.range;

            // ---- reference range
            if (r) {
                const label = strategyLabel(analysis.strategyId);
                const inWindow = candles.filter(c => c.time >= r.startTime && c.time < r.endTime);
                if (inWindow.length > 0) {
                    const t0 = inWindow[0].time;
                    const t1 = inWindow[inWindow.length - 1].time;
                    addSegment(t0, t1, r.high, COLORS.range, 3);
                    addSegment(t0, t1, r.low, COLORS.range, 3);
                }
                if (analysis.watch) {
                    // Nothing has triggered yet: each range edge doubles as an entry for one
                    // direction and the target for the other, so the labels say both.
                    addLine(r.high, `${label} High · Sell entry / Buy TP`, COLORS.range, true, 1);
                    addLine(r.low, `${label} Low · Buy entry / Sell TP`, COLORS.range, true, 1);
                    addLine(analysis.watch.sell.stopLoss, 'Sell SL (if High swept)', COLORS.sl, true, 1);
                    addLine(analysis.watch.buy.stopLoss, 'Buy SL (if Low swept)', COLORS.sl, true, 1);
                } else {
                    addLine(r.high, `${label} High`, COLORS.range, true, 1);
                    addLine(r.low, `${label} Low`, COLORS.range, true, 1);
                }
            }

            // ---- sweep wick
            if (analysis.sweep) {
                const sw = analysis.sweep;
                markers.push({
                    time: sw.extremeTime as UTCTimestamp,
                    position: sw.side === 'high' ? 'aboveBar' : 'belowBar',
                    shape: sw.side === 'high' ? 'arrowDown' : 'arrowUp',
                    color: COLORS.sweep,
                    text: 'Sweep',
                });
            }

            // ---- break of structure, FVG, entry, stop, target, risk/reward boxes
            const bos = analysis.bos;
            if (bos && plan) {
                const sell = plan.side === 'SELL';
                addSegment(bos.swingTime, bos.bosTime ?? lastT, bos.level, COLORS.bos, 2, true);
                if (bos.bosTime !== null) {
                    markers.push({
                        time: bos.bosTime as UTCTimestamp,
                        position: sell ? 'belowBar' : 'aboveBar',
                        shape: sell ? 'arrowDown' : 'arrowUp',
                        color: COLORS.bos,
                        text: 'BOS',
                    });
                }
                if (analysis.fvg) {
                    addZone(analysis.fvg.startTime, endT, analysis.fvg.bottom, analysis.fvg.top, COLORS.fvgFill);
                    markers.push({
                        time: (analysis.fvg.startTime + len) as UTCTimestamp,
                        position: 'inBar',
                        shape: 'square',
                        color: COLORS.fvg,
                        text: 'FVG',
                    });
                }
                // risk (red) and reward (green) boxes
                const t0 = analysis.entryTime ?? bos.bosTime ?? lastT;
                const planned = bos.bosTime === null;
                addZone(t0, endT, plan.entry, plan.takeProfit, planned ? COLORS.rewardFaint : COLORS.rewardFill);
                addZone(t0, endT, plan.entry, plan.stopLoss, planned ? COLORS.riskFaint : COLORS.riskFill);

                const entryTitle = planned
                    ? 'Entry (planned, after BOS)'
                    : analysis.entryTime
                    ? `Entry ${plan.side}`
                    : `Entry ${plan.side} (pullback to BOS)`;
                addLine(plan.entry, entryTitle, COLORS.entry, analysis.entryTime === null);
                addLine(plan.stopLoss, 'SL', COLORS.sl);
                addLine(plan.takeProfit, `TP · RR 1:${plan.rr.toFixed(1)}`, COLORS.tp);
                addLine(plan.midpoint, 'Mid', COLORS.mid, true, 1);

                // ---- projected market path: W shape for a BUY, M shape for a SELL, ending at the TP
                const dir = sell ? -1 : 1;
                const lastClose = candles[candles.length - 1].close;
                const startPrice = analysis.entryTime !== null ? lastClose : plan.entry;
                const reach = Math.abs(plan.takeProfit - startPrice);
                const risk = Math.abs(plan.entry - plan.stopLoss);
                if (reach > 0) {
                    // first dip / spike is kept small and never goes past half-way to the stop loss
                    const dip = Math.min(reach * 0.2, risk * 0.5);
                    // [candles ahead, price]
                    const steps: Array<[number, number]> = [
                        [0, startPrice],
                        [2, startPrice - dir * dip],
                        [4, startPrice + dir * reach * 0.4],
                        [6, startPrice + dir * reach * 0.1],
                        [8, plan.takeProfit],
                    ];
                    const pathSeries = chart.addLineSeries({
                        color: COLORS.path,
                        lineWidth: 2,
                        lineStyle: 2,
                        lastValueVisible: false,
                        priceLineVisible: false,
                        crosshairMarkerVisible: false,
                    });
                    pathSeries.setData(steps.map(([k, value]) => ({ time: (lastT + len * k) as UTCTimestamp, value })));
                    pathSeries.setMarkers([
                        {
                            time: (lastT + len * 8) as UTCTimestamp,
                            position: sell ? 'belowBar' : 'aboveBar',
                            shape: sell ? 'arrowDown' : 'arrowUp',
                            color: COLORS.path,
                            text: sell ? 'Expected (M)' : 'Expected (W)',
                        },
                    ]);
                    extraRef.current.push(pathSeries);
                }

                // the point of entry itself
                markers.push(
                    analysis.entryTime !== null
                        ? {
                              time: analysis.entryTime as UTCTimestamp,
                              position: sell ? 'aboveBar' : 'belowBar',
                              shape: sell ? 'arrowDown' : 'arrowUp',
                              color: COLORS.entry,
                              text: `ENTRY ${plan.side}`,
                          }
                        : {
                              time: lastT as UTCTimestamp,
                              position: 'inBar',
                              shape: 'circle',
                              color: COLORS.entry,
                              text: planned ? 'Entry' : 'Entry zone',
                          }
                );
            }

            // Labels on neighbouring candles would overlap, so keep the text of the most important
            // marker (entry > sweep > BOS > FVG) and show only the arrow/shape for the others.
            const rank = (m: SeriesMarker<Time>) => {
                const t = m.text ?? '';
                return t.startsWith('ENTRY') || t.startsWith('Entry') ? 0 : t === 'Sweep' ? 1 : t === 'BOS' ? 2 : 3;
            };
            const keep: SeriesMarker<Time>[] = [];
            [...markers]
                .sort((a, b) => rank(a) - rank(b))
                .forEach(m => {
                    const clash = keep.some(k => k.text && Math.abs((k.time as number) - (m.time as number)) < 7 * len);
                    keep.push(clash ? { ...m, text: '' } : m);
                });
            keep.sort((a, b) => (a.time as number) - (b.time as number));
            series.setMarkers(keep);

            // make autoscale include all levels
            const lv: number[] = [];
            if (r) lv.push(r.high, r.low);
            if (plan) lv.push(plan.entry, plan.stopLoss, plan.takeProfit);
            if (analysis.watch) lv.push(analysis.watch.sell.stopLoss, analysis.watch.buy.stopLoss);
            if (analysis.fvg) lv.push(analysis.fvg.top, analysis.fvg.bottom);
            if (lv.length) {
                const span = Math.max(...lv) - Math.min(...lv);
                levelsRef.current = { min: Math.min(...lv) - span * 0.04, max: Math.max(...lv) + span * 0.04 };
            }

            // Frame the range and the move after it, with room on the right for the boxes.
            if (r) {
                const idx = candles.findIndex(c => c.time >= r.startTime);
                const from = Math.max(0, (idx < 0 ? 0 : idx) - 8);
                chart.timeScale().setVisibleLogicalRange({ from, to: candles.length + 10 });
            }
        },
        screenshot() {
            const chart = chartRef.current;
            if (!chart) return null;
            try {
                const src = chart.takeScreenshot();
                const maxW = 1100;
                const scale = Math.min(1, maxW / src.width);
                const out = document.createElement('canvas');
                out.width = Math.round(src.width * scale);
                out.height = Math.round(src.height * scale);
                const ctx = out.getContext('2d');
                if (!ctx) return null;
                ctx.drawImage(src, 0, 0, out.width, out.height);
                return out.toDataURL('image/jpeg', 0.8);
            } catch {
                return null;
            }
        },
      };
      // redrawing the analysis must never move or re-zoom what the person is looking at
      const keepView = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
          const ts = chartRef.current?.timeScale();
          const range = ts?.getVisibleLogicalRange() ?? null;
          fn(...a);
          if (ts && range) ts.setVisibleLogicalRange(range);
      };
      return { ...impl, drawAnalysis: keepView(impl.drawAnalysis), drawPdh: keepView(impl.drawPdh) };
    });

    return (
        <>
            <div ref={hostRef} className='forex-trader__chart-host' />
            {apis && (
                <ChartDrawings chart={apis.chart} series={apis.series} getCandles={() => candlesRef.current} pipSize={pipSize} resetKey={resetKey} />
            )}
        </>
    );
});

export default ChartView;
