import { useEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import ChartView, { type ChartViewHandle } from './chart-view';
import type { Candle } from './engine';
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

/** Starting candle sizes for the charts: the M15 direction, the M5 entry, then the bigger picture. */
const START_SIZES = [900, 300, 3600, 14400];

export interface CompareLine {
    key: string;
    title: string;
    price: number;
    color: string;
}

type OhlcMsg = {
    error?: { message?: string };
    candles?: Array<{ epoch: number; open: number; high: number; low: number; close: number }>;
    ohlc?: { open_time: number; open: string | number; high: string | number; low: string | number; close: string | number };
};

const decimalsOf = (n: number) => Math.min(6, (String(n).split('.')[1] ?? '').length);

/** One chart of the same market with its own candle size and its own live feed. */
const ChartPanel = ({ symbol, startSec, lines }: { symbol: string; startSec: number; lines: CompareLine[] }) => {
    const { ws, isConnected } = useDerivWS();
    const [sec, setSec] = useState(startSec);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pip, setPip] = useState(2);
    const [last, setLast] = useState<number | null>(null);
    const chartRef = useRef<ChartViewHandle>(null);

    useEffect(() => {
        if (!ws || !isConnected || !symbol) return undefined;
        let off = false;
        let unsub: (() => void) | null = null;
        setLoading(true);
        setError(null);
        const count = Math.min(600, Math.ceil((10 * 86400) / sec));
        ws.subscribe(
            { ticks_history: symbol, style: 'candles', granularity: sec, end: 'latest', count, adjust_start_time: 1 },
            data => {
                if (off) return;
                const d = data as OhlcMsg;
                if (d.error) {
                    setError(d.error.message ?? 'Could not load candles');
                    setLoading(false);
                    return;
                }
                if (d.candles) {
                    const list: Candle[] = d.candles.map(c => ({
                        time: c.epoch,
                        open: Number(c.open),
                        high: Number(c.high),
                        low: Number(c.low),
                        close: Number(c.close),
                    }));
                    setPip(Math.max(2, ...list.slice(-50).map(c => decimalsOf(c.close))));
                    chartRef.current?.setCandles(list);
                    setLast(list.length ? list[list.length - 1].close : null);
                    setLoading(false);
                } else if (d.ohlc) {
                    const c: Candle = {
                        time: Number(d.ohlc.open_time),
                        open: Number(d.ohlc.open),
                        high: Number(d.ohlc.high),
                        low: Number(d.ohlc.low),
                        close: Number(d.ohlc.close),
                    };
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
    }, [ws, isConnected, symbol, sec]);

    // open trades on this market, drawn on every chart
    const lineKey = lines.map(l => `${l.key}:${l.price}:${l.title}`).join('|');
    useEffect(() => {
        chartRef.current?.drawLines(lines);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineKey, loading]);

    return (
        <div className='fl-compare__panel'>
            <div className='fl-compare__panel-head'>
                <div className='fl-compare__sizes' role='group' aria-label='Candle size'>
                    {SIZES.map(s => (
                        <button
                            key={s.sec}
                            type='button'
                            className={s.sec === sec ? 'is-on' : ''}
                            onClick={() => setSec(s.sec)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                {last !== null && <span className='fl-compare__price'>{last.toFixed(pip)}</span>}
            </div>
            <div className='fl-compare__chart'>
                <ChartView ref={chartRef} pipSize={pip} />
                {loading && !error && <div className='fl-compare__note'>Loading chart…</div>}
                {error && <div className='fl-compare__note fl-compare__note--error'>{error}</div>}
            </div>
        </div>
    );
};

interface Props {
    symbol: string;
    marketName: string;
    lines: CompareLine[];
    onClose: () => void;
}

/**
 * A pop-up over the whole Forex Live page with 2 or 4 charts of the same market side by side, each with its
 * own candle size, so the trend can be compared across timeframes (for example M15 beside M5).
 */
const CompareCharts = ({ symbol, marketName, lines, onClose }: Props) => {
    const [count, setCount] = useState<2 | 4>(2);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className='fl-compare' role='dialog' aria-label='Compare charts'>
            <header className='fl-compare__head'>
                <b>{marketName}</b>
                <span className='fl-compare__hint'>Each chart has its own candle size</span>
                <div className='fl-compare__layout' role='group' aria-label='Number of charts'>
                    <button type='button' className={count === 2 ? 'is-on' : ''} onClick={() => setCount(2)}>
                        2 charts
                    </button>
                    <button type='button' className={count === 4 ? 'is-on' : ''} onClick={() => setCount(4)}>
                        4 charts
                    </button>
                </div>
                <button type='button' className='fl-compare__close' onClick={onClose} aria-label='Close'>
                    ×
                </button>
            </header>
            <div className={`fl-compare__grid fl-compare__grid--${count}`}>
                {START_SIZES.slice(0, count).map((sec, i) => (
                    <ChartPanel key={`${symbol}-${i}`} symbol={symbol} startSec={sec} lines={lines} />
                ))}
            </div>
        </div>
    );
};

export default CompareCharts;
