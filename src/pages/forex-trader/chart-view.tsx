import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
    createChart,
    type CandlestickData,
    type IChartApi,
    type IPriceLine,
    type ISeriesApi,
    type LineData,
    type UTCTimestamp,
} from 'lightweight-charts';
import type { Analysis, Candle } from './engine';
import { strategyLabel } from './engine';

export interface ChartViewHandle {
    /** Replace all candles (initial load / market or timeframe change). */
    setCandles: (candles: Candle[]) => void;
    /** Add or update the newest candle (live stream). */
    updateCandle: (candle: Candle) => void;
    /** Draw (or clear, with null) the named lines for an analysis. */
    drawAnalysis: (analysis: Analysis | null, candles: Candle[]) => void;
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
    sweep: '#a855f7',
};

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
    const extraRef = useRef<ISeriesApi<'Line'>[]>([]);
    const levelsRef = useRef<{ min: number; max: number } | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const dark = isDarkTheme(host);
        const chart = createChart(host, {
            width: host.clientWidth,
            height: host.clientHeight,
            layout: {
                background: { color: dark ? '#0e1116' : '#ffffff' },
                textColor: dark ? '#c7cdd6' : '#374151',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: dark ? '#1b2029' : '#eef0f3' },
                horzLines: { color: dark ? '#1b2029' : '#eef0f3' },
            },
            rightPriceScale: { borderColor: dark ? '#2a303b' : '#d9dde3' },
            timeScale: { borderColor: dark ? '#2a303b' : '#d9dde3', timeVisible: true, secondsVisible: false },
            crosshair: { mode: 0 },
        });
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

        const ro = new ResizeObserver(() => {
            if (host.clientWidth > 0 && host.clientHeight > 0) {
                chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
            }
        });
        ro.observe(host);
        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
            linesRef.current = [];
            extraRef.current = [];
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

    useImperativeHandle(ref, () => ({
        setCandles(candles) {
            clearDrawing();
            seriesRef.current?.setData(candles.map(toBar));
            chartRef.current?.timeScale().fitContent();
        },
        updateCandle(candle) {
            seriesRef.current?.update(toBar(candle));
        },
        drawAnalysis(analysis, candles) {
            const series = seriesRef.current;
            const chart = chartRef.current;
            clearDrawing();
            if (!series || !chart || !analysis) return;

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

            const r = analysis.range;
            if (r) {
                const label = strategyLabel(analysis.strategyId);
                // Box edges drawn only across the window the range was measured in.
                const inWindow = candles.filter(c => c.time >= r.startTime && c.time < r.endTime);
                if (inWindow.length > 0) {
                    const t0 = inWindow[0].time as UTCTimestamp;
                    const t1 = inWindow[inWindow.length - 1].time as UTCTimestamp;
                    for (const price of [r.high, r.low]) {
                        const s = chart.addLineSeries({
                            color: COLORS.range,
                            lineWidth: 3,
                            lastValueVisible: false,
                            priceLineVisible: false,
                            crosshairMarkerVisible: false,
                        });
                        const pts: LineData[] = [
                            { time: t0, value: price },
                            { time: t1, value: price },
                        ];
                        s.setData(pts);
                        extraRef.current.push(s);
                    }
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
            if (analysis.sweep) {
                const sw = analysis.sweep;
                series.setMarkers([
                    {
                        time: sw.extremeTime as UTCTimestamp,
                        position: sw.side === 'high' ? 'aboveBar' : 'belowBar',
                        shape: sw.side === 'high' ? 'arrowDown' : 'arrowUp',
                        color: COLORS.sweep,
                        text: 'Sweep',
                    },
                ]);
            }
            const p = analysis.plan;
            if (p && (analysis.state === 'ready' || analysis.state === 'invalidated' || analysis.state === 'target_reached' || analysis.state === 'expired')) {
                addLine(p.entry, 'Entry', COLORS.entry);
                addLine(p.stopLoss, 'SL', COLORS.sl);
                addLine(p.takeProfit, 'TP', COLORS.tp);
                addLine(p.midpoint, 'Mid', COLORS.mid, true, 1);
            }

            // make autoscale include all levels
            const lv: number[] = [];
            if (analysis.range) lv.push(analysis.range.high, analysis.range.low);
            if (analysis.plan) lv.push(analysis.plan.entry, analysis.plan.stopLoss, analysis.plan.takeProfit);
            if (analysis.watch) lv.push(analysis.watch.sell.stopLoss, analysis.watch.buy.stopLoss);
            if (lv.length) {
                const span = Math.max(...lv) - Math.min(...lv);
                levelsRef.current = { min: Math.min(...lv) - span * 0.04, max: Math.max(...lv) + span * 0.04 };
            }

            // Frame the range and the move after it.
            if (r && candles.length > 0) {
                const idx = candles.findIndex(c => c.time >= r.startTime);
                const from = Math.max(0, (idx < 0 ? 0 : idx) - 8);
                chart.timeScale().setVisibleLogicalRange({ from, to: candles.length + 6 });
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
    }));

    return <div ref={hostRef} className='forex-trader__chart-host' />;
});

export default ChartView;
