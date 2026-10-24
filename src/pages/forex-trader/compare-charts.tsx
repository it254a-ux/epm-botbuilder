import { useCallback, useEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import ChartView, { type ChartViewHandle } from './chart-view';
import { analyse, type Candle, type MarketKind, type SweepStrategyId } from './engine';
import { analyseMtf, M15_SEC, type MtfSignal } from './mtf';
import { analysePreviousDay } from './pdh';
import { useSharedPick } from './shared-picks';
import { STRATEGIES } from './strategies';
import './compare-charts.scss';

/** Candle sizes Deriv offers, in seconds. */
const SIZES = [
    { label: '1m', sec: 60 },
    { label: '5m', sec: 300 },
    { label: '15m', sec: 900 },
    { label: '30m', sec: 1800 },
    { label: '1h', sec: 3600 },
    { label: '2h', sec: 7200 },
    { label: '4h', sec: 14400 },
    { label: '1d', sec: 86400 },
];

/** Candle sizes for the charts, in the order they are opened: the M15 direction, the M5 entry, then the bigger picture. */
const OPEN_ORDER = [900, 300, 3600, 14400];
const MAX_CHARTS = 4;

export interface CompareLine {
    key: string;
    title: string;
    price: number;
    color: string;
}

type Overlay = 'off' | 'strategy' | 'prevday';

type CandleMsg = {
    error?: { message?: string };
    candles?: Array<{ epoch: number; open: number; high: number; low: number; close: number }>;
    ohlc?: { open_time: number; open: string | number; high: string | number; low: string | number; close: string | number };
};

const toCandle = (c: { epoch: number; open: number; high: number; low: number; close: number }): Candle => ({
    time: c.epoch,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
});

const fromOhlc = (o: NonNullable<CandleMsg['ohlc']>): Candle => ({
    time: Number(o.open_time),
    open: Number(o.open),
    high: Number(o.high),
    low: Number(o.low),
    close: Number(o.close),
});

const decimalsOf = (n: number) => Math.min(6, (String(n).split('.')[1] ?? '').length);

const merge = (arr: Candle[], c: Candle) => {
    const last = arr[arr.length - 1];
    if (last && last.time === c.time) arr[arr.length - 1] = c;
    else if (!last || c.time > last.time) arr.push(c);
};

interface PanelProps {
    symbol: string;
    kind: MarketKind;
    strategyId: number;
    startSec: number;
    lines: CompareLine[];
    onClose: () => void;
}

/**
 * One chart of the market with its own candle size and live feed. It can draw the Forex Trader analysis on
 * itself (the chosen strategy, or the Previous Day High / Low setup) and the open trades; each is switched
 * on or off here, so a chart can be kept clean for reading the trend.
 */
const ChartPanel = ({ symbol, kind, strategyId, startSec, lines, onClose }: PanelProps) => {
    const { ws, isConnected } = useDerivWS({ persistent: true });
    const [sec, setSec] = useState(startSec);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pip, setPip] = useState(2);
    const [last, setLast] = useState<number | null>(null);
    const [overlay, setOverlay] = useState<Overlay>('off');
    const [showTrades, setShowTrades] = useState(true);
    const [pill, setPill] = useState<{ text: string; tone: 'buy' | 'sell' | 'wait' } | null>(null);
    const chartRef = useRef<ChartViewHandle>(null);
    const candlesRef = useRef<Candle[]>([]);
    const streamRef = useRef('');
    const m15Ref = useRef<Candle[]>([]);
    const drawKey = useRef('');
    const live = useRef({ overlay, strategyId, kind, sec });
    live.current = { overlay, strategyId, kind, sec };

    // draw (or redraw) the chosen analysis from the candles we have, only when something about it changed
    const refreshOverlay = useCallback(() => {
        const { overlay: ov, strategyId: sid, kind: k, sec: s } = live.current;
        const chart = chartRef.current;
        if (!chart) return;
        if (ov === 'off') {
            if (drawKey.current !== 'off') {
                drawKey.current = 'off';
                chart.drawAnalysis(null, []);
                setPill(null);
            }
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const all = candlesRef.current;
        if (ov === 'strategy') {
            const strat = STRATEGIES.find(x => x.id === sid);
            if (!strat?.ready || all.length < 3) return;
            const closed = all.filter(x => x.time + s <= now);
            const forming = all.find(x => x.time + s > now) ?? null;
            const a = analyse(sid as SweepStrategyId, closed, k, forming, now);
            const key = `s|${sid}|${a.state}|${a.sweep?.confirmTime ?? ''}|${closed.length}|${a.plan?.stopLoss ?? ''}`;
            if (key !== drawKey.current) {
                drawKey.current = key;
                chart.drawAnalysis(a, closed);
                const tone = a.state === 'ready' && a.plan ? (a.plan.side === 'BUY' ? 'buy' : 'sell') : 'wait';
                setPill({ text: a.statusText, tone });
            }
            return;
        }
        // Previous Day High / Low setup: needs 5-minute candles here and the 15-minute ones behind them
        if (s !== 300 || m15Ref.current.length < 5 || all.length < 5) return;
        const r = analysePreviousDay(m15Ref.current, all, now);
        const key = ['p', r.stage, r.side, r.levelPrice, r.footprint.count, r.sweep?.time, r.rejection?.time, r.plan?.entry, r.plan?.stopLoss, r.signalTime].join('|');
        if (key !== drawKey.current) {
            drawKey.current = key;
            chart.drawPdh(r);
            const m = analyseMtf(m15Ref.current, all, now);
            const sig: MtfSignal = m.signal;
            setPill({ text: sig === 'WAIT' ? 'M15 + M5: wait' : `M15 + M5: ${sig}`, tone: sig === 'BUY' ? 'buy' : sig === 'SELL' ? 'sell' : 'wait' });
        }
    }, []);

    // the chart's own candles (history + live)
    useEffect(() => {
        if (!ws || !isConnected || !symbol) return undefined;
        let off = false;
        let unsub: (() => void) | null = null;
        // same market and candle size starting again after a dropped connection: keep the chart as it is, fill in what was missed
        const streamKey = `${symbol}|${sec}`;
        const sameStream = streamRef.current === streamKey && candlesRef.current.length > 0;
        streamRef.current = streamKey;
        setError(null);
        if (!sameStream) {
            setLoading(true);
            candlesRef.current = [];
            drawKey.current = '';
        }
        const count = Math.min(600, Math.ceil((10 * 86400) / sec));
        ws.subscribe(
            { ticks_history: symbol, style: 'candles', granularity: sec, end: 'latest', count, adjust_start_time: 1 },
            data => {
                if (off) return;
                const d = data as CandleMsg;
                if (d.error) {
                    setError(d.error.message ?? 'Could not load candles');
                    setLoading(false);
                    return;
                }
                if (d.candles) {
                    const list = d.candles.map(toCandle);
                    if (sameStream && candlesRef.current.length) {
                        const byTime = new Map<number, Candle>();
                        candlesRef.current.forEach(c => byTime.set(c.time, c));
                        list.forEach(c => byTime.set(c.time, c));
                        candlesRef.current = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
                        chartRef.current?.mergeCandles(list);
                    } else {
                        candlesRef.current = list;
                        drawKey.current = '';
                        setPip(Math.max(2, ...list.slice(-50).map(c => decimalsOf(c.close))));
                        chartRef.current?.setCandles(list);
                    }
                    const all = candlesRef.current;
                    setLast(all.length ? all[all.length - 1].close : null);
                    setLoading(false);
                    refreshOverlay();
                } else if (d.ohlc) {
                    const c = fromOhlc(d.ohlc);
                    merge(candlesRef.current, c);
                    chartRef.current?.updateCandle(c);
                    setLast(c.close);
                }
            }
        )
            .then(sub => {
                if (off) sub.unsubscribe();
                else unsub = sub.unsubscribe;
            })
            .catch(err => {
                if (!off) {
                    setError(err instanceof Error ? err.message : 'Connection error');
                    setLoading(false);
                }
            });
        return () => {
            off = true;
            if (unsub) unsub();
        };
    }, [ws, isConnected, symbol, sec, refreshOverlay]);

    // the 15-minute candles behind the Previous Day setup (only while that is chosen on a 5-minute chart)
    useEffect(() => {
        if (overlay !== 'prevday' || sec !== 300 || !ws || !isConnected || !symbol) return undefined;
        let off = false;
        let unsub: (() => void) | null = null;
        m15Ref.current = [];
        ws.subscribe(
            { ticks_history: symbol, style: 'candles', granularity: M15_SEC, end: 'latest', count: 400, adjust_start_time: 1 },
            data => {
                if (off) return;
                const d = data as CandleMsg;
                if (d.candles) {
                    m15Ref.current = d.candles.map(toCandle);
                    drawKey.current = '';
                    refreshOverlay();
                } else if (d.ohlc) {
                    merge(m15Ref.current, fromOhlc(d.ohlc));
                }
            }
        )
            .then(sub => {
                if (off) sub.unsubscribe();
                else unsub = sub.unsubscribe;
            })
            .catch(() => {});
        return () => {
            off = true;
            if (unsub) unsub();
        };
    }, [overlay, sec, ws, isConnected, symbol, refreshOverlay]);

    // switching the overlay (or the strategy) redraws at once; while it is on, a steady check keeps it live
    useEffect(() => {
        drawKey.current = '';
        refreshOverlay();
    }, [overlay, strategyId, refreshOverlay]);
    useEffect(() => {
        if (overlay === 'off') return undefined;
        const t = window.setInterval(refreshOverlay, 1500);
        return () => window.clearInterval(t);
    }, [overlay, refreshOverlay]);

    // open trades on this market, drawn on the chart unless switched off
    const shown = showTrades ? lines : [];
    const lineKey = shown.map(l => `${l.key}:${l.price}:${l.title}`).join('|');
    useEffect(() => {
        chartRef.current?.drawLines(shown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineKey, loading]);

    const prevdayOk = sec === 300;

    return (
        <div className='fl-compare__panel'>
            <div className='fl-compare__panel-head'>
                <div className='fl-compare__sizes' role='group' aria-label='Candle size'>
                    {SIZES.map(x => (
                        <button key={x.sec} type='button' className={x.sec === sec ? 'is-on' : ''} onClick={() => setSec(x.sec)}>
                            {x.label}
                        </button>
                    ))}
                </div>
                <div className='fl-compare__sizes' role='group' aria-label='Analysis on this chart'>
                    <button type='button' className={overlay === 'off' ? 'is-on' : ''} onClick={() => setOverlay('off')}>
                        Clean
                    </button>
                    <button type='button' className={overlay === 'strategy' ? 'is-on' : ''} onClick={() => setOverlay('strategy')} title='Draw the chosen strategy on this chart'>
                        Strategy
                    </button>
                    <button
                        type='button'
                        className={overlay === 'prevday' ? 'is-on' : ''}
                        onClick={() => {
                            // the setup is read on 5-minute candles: this chart switches to 5m by itself
                            if (!prevdayOk) setSec(300);
                            setOverlay('prevday');
                        }}
                        title={prevdayOk ? 'Draw the Previous Day High / Low setup (M15 direction + M5 entry)' : 'Draw the Previous Day High / Low setup (this chart switches to 5m)'}
                    >
                        Prev day
                    </button>
                </div>
                <button
                    type='button'
                    className={`fl-compare__chip${showTrades ? ' is-on' : ''}`}
                    onClick={() => setShowTrades(v => !v)}
                    aria-pressed={showTrades}
                    title='Show or hide your open trades on this chart'
                >
                    Trades
                </button>
                {pill && <span className={`fl-compare__pill fl-compare__pill--${pill.tone}`}>{pill.text}</span>}
                {last !== null && <span className='fl-compare__price'>{last.toFixed(pip)}</span>}
                <button type='button' className='fl-compare__x' onClick={onClose} aria-label='Close this chart' title='Close this chart'>
                    ×
                </button>
            </div>
            <div className='fl-compare__chart'>
                <ChartView ref={chartRef} pipSize={pip} studies={false} />
                {loading && !error && <div className='fl-compare__note'>Loading chart…</div>}
                {error && <div className='fl-compare__note fl-compare__note--error'>{error}</div>}
            </div>
        </div>
    );
};

interface Props {
    symbol: string;
    marketName: string;
    kind: MarketKind;
    lines: CompareLine[];
    onClose: () => void;
}

/**
 * A pop-up over the whole Forex Live page (chart and right-hand panel) with 2 to 4 charts of the same market,
 * each with its own candle size and its own analysis switches, so the trend can be compared across timeframes.
 * It exists only while 2 or more charts are open: closing charts down to one closes the pop-up.
 */
const CompareCharts = ({ symbol, marketName, kind, lines, onClose }: Props) => {
    const [strategyId] = useSharedPick('strategyId', 1, true);
    const nextId = useRef(3);
    const [panels, setPanels] = useState([
        { id: 1, sec: OPEN_ORDER[0] },
        { id: 2, sec: OPEN_ORDER[1] },
    ]);

    // fewer than two charts is not a comparison: back to the normal chart
    useEffect(() => {
        if (panels.length < 2) onClose();
    }, [panels.length, onClose]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const add = () =>
        setPanels(p => {
            if (p.length >= MAX_CHARTS) return p;
            const sec = OPEN_ORDER.find(s => !p.some(x => x.sec === s)) ?? OPEN_ORDER[p.length % OPEN_ORDER.length];
            return [...p, { id: nextId.current++, sec }];
        });

    return (
        <div className='fl-compare' role='dialog' aria-label='Compare charts'>
            <header className='fl-compare__head'>
                <b>{marketName}</b>
                <span className='fl-compare__hint'>Each chart has its own candle size and analysis switches</span>
                <button type='button' className='fl-compare__btn' onClick={add} disabled={panels.length >= MAX_CHARTS}>
                    Add chart
                </button>
                <button type='button' className='fl-compare__btn' onClick={onClose}>
                    Close all
                </button>
            </header>
            <div className={`fl-compare__grid fl-compare__grid--${panels.length}`}>
                {panels.map(p => (
                    <ChartPanel
                        key={`${symbol}-${p.id}`}
                        symbol={symbol}
                        kind={kind}
                        strategyId={strategyId}
                        startSec={p.sec}
                        lines={lines}
                        onClose={() => setPanels(list => list.filter(x => x.id !== p.id))}
                    />
                ))}
            </div>
        </div>
    );
};

export default CompareCharts;
