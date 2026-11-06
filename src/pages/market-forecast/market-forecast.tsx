import { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { DerivWS } from '@deriv/core';
import {
    closedOnly,
    decimalsOf,
    leanOf,
    medianBars,
    readLevels,
    type Bar,
    type ForecastResult,
} from './forecast-math';
import './market-forecast.scss';

/**
 * Market Forecast: the Kronos model (https://github.com/shiyu-coder/Kronos) reads the latest candles of a
 * market and writes several possible futures. The middle of them is drawn as faded candles after the real ones,
 * with a band around it, plus a few plain numbers. It is a guide, never a promise.
 * Deriv's synthetic indices are left out on purpose: their prices come from a random number generator.
 */
const MARKETS = [
    { symbol: 'frxXAUUSD', name: 'Gold/USD' },
    { symbol: 'frxEURUSD', name: 'EUR/USD' },
    { symbol: 'frxGBPUSD', name: 'GBP/USD' },
    { symbol: 'frxUSDJPY', name: 'USD/JPY' },
    { symbol: 'frxAUDUSD', name: 'AUD/USD' },
    { symbol: 'frxUSDCAD', name: 'USD/CAD' },
    { symbol: 'frxGBPJPY', name: 'GBP/JPY' },
    { symbol: 'cryBTCUSD', name: 'BTC/USD' },
];
const TIMEFRAMES = [
    { sec: 300, label: '5 min' },
    { sec: 900, label: '15 min' },
    { sec: 3600, label: '1 hour' },
];
const HORIZONS = [24, 48, 96]; // candles ahead
const PATHS = 4;
const HISTORY = 420;

interface CandleMsg {
    candles?: Array<{ epoch: number; open: number; high: number; low: number; close: number }>;
}

/** Rejects with `message` if the promise has not finished in `ms` milliseconds. */
function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            err => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

/**
 * The newest candles of a market. Each call opens its own short connection to Deriv's public data feed and
 * closes it again, so it never depends on a shared connection that might have dropped in between.
 */
async function loadCandles(symbol: string, sec: number): Promise<Bar[]> {
    const socket = new DerivWS();
    try {
        await within(socket.connect(), 12000, 'Could not reach the market data. Please check your internet and try again.');
        const d = await within(
            socket.send<CandleMsg>({ ticks_history: symbol, style: 'candles', granularity: sec, end: 'latest', count: HISTORY, adjust_start_time: 1 }),
            15000,
            'Loading candles took too long. Please try again.'
        );
        if (!d.candles?.length) throw new Error('No candles came back for this market.');
        return d.candles.map(c => ({ time: c.epoch, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) }));
    } finally {
        socket.disconnect();
    }
}

const spanText = (seconds: number) =>
    seconds >= 3600 ? `${Math.round(seconds / 360) / 10} h` : `${Math.round(seconds / 60)} min`;

const toPoint = (b: Bar) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close });

const MarketForecast = () => {
    const [symbol, setSymbol] = useState('frxXAUUSD');
    const [sec, setSec] = useState(300);
    const [horizon, setHorizon] = useState(48);
    const [side, setSide] = useState<'none' | 'buy' | 'sell'>('none');
    const [tp, setTp] = useState('');
    const [sl, setSl] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [result, setResult] = useState<ForecastResult | null>(null);

    const holder = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const realRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const ghostRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const lowRef = useRef<ISeriesApi<'Line'> | null>(null);
    const highRef = useRef<ISeriesApi<'Line'> | null>(null);
    const linesRef = useRef<IPriceLine[]>([]);
    const busyRef = useRef(false);

    // the chart, created once
    useEffect(() => {
        const el = holder.current;
        if (!el) return undefined;
        const text = getComputedStyle(el).color || '#888';
        const chart = createChart(el, {
            width: el.clientWidth,
            height: el.clientHeight,
            layout: { background: { color: 'transparent' }, textColor: text },
            grid: { vertLines: { color: 'rgba(128,128,128,0.12)' }, horzLines: { color: 'rgba(128,128,128,0.12)' } },
            rightPriceScale: { borderColor: 'rgba(128,128,128,0.3)' },
            timeScale: { borderColor: 'rgba(128,128,128,0.3)', timeVisible: true, secondsVisible: false },
        });
        realRef.current = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderUpColor: '#26a69a', borderDownColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        });
        ghostRef.current = chart.addCandlestickSeries({
            upColor: 'rgba(38,166,154,0.35)', downColor: 'rgba(239,83,80,0.35)', borderUpColor: 'rgba(38,166,154,0.8)', borderDownColor: 'rgba(239,83,80,0.8)', wickUpColor: 'rgba(38,166,154,0.8)', wickDownColor: 'rgba(239,83,80,0.8)',
        });
        lowRef.current = chart.addLineSeries({ color: 'rgba(66,133,244,0.8)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
        highRef.current = chart.addLineSeries({ color: 'rgba(66,133,244,0.8)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
        chartRef.current = chart;
        const resize = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
        resize.observe(el);
        return () => {
            resize.disconnect();
            chart.remove();
            chartRef.current = null;
        };
    }, []);

    const clearForecast = useCallback(() => {
        ghostRef.current?.setData([]);
        lowRef.current?.setData([]);
        highRef.current?.setData([]);
        linesRef.current.forEach(l => realRef.current?.removePriceLine(l));
        linesRef.current = [];
        setResult(null);
    }, []);

    // show the market's latest candles whenever the market or candle size changes
    useEffect(() => {
        let off = false;
        clearForecast();
        setMessage('');
        setIsError(false);
        loadCandles(symbol, sec)
            .then(bars => {
                if (off) return;
                realRef.current?.setData(bars.map(toPoint));
                chartRef.current?.timeScale().fitContent();
            })
            .catch(err => {
                if (off) return;
                setIsError(true);
                setMessage(err instanceof Error ? err.message : 'Could not load candles');
            });
        return () => {
            off = true;
        };
    }, [symbol, sec, clearForecast]);

    const run = useCallback(async () => {
        if (busyRef.current) return;
        const read = readLevels(side, tp, sl);
        if ('error' in read) {
            setIsError(true);
            setMessage(read.error);
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setIsError(false);
        try {
            setMessage('Loading the latest candles…');
            const all = await loadCandles(symbol, sec);
            const closed = closedOnly(all, sec, Math.floor(Date.now() / 1000));
            if (closed.length < 64) throw new Error('Not enough candles for this market right now.');
            clearForecast();
            realRef.current?.setData(closed.map(toPoint));

            setMessage('Kronos is working… this can take up to a minute.');
            const r = await fetch('/api/kronos-forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candles: closed.slice(-HISTORY).map(b => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close })),
                    pred_len: horizon,
                    paths: PATHS,
                    levels: read.levels ?? undefined,
                }),
            });
            const data = (await r.json().catch(() => null)) as (ForecastResult & { error?: string }) | null;
            if (!r.ok || !data || !Array.isArray(data.paths)) {
                throw new Error(data?.error ?? 'The forecast service is offline right now. Please try again later.');
            }

            ghostRef.current?.setData(medianBars(data.paths).map(toPoint));
            const times = data.paths[0].map(c => c.t as UTCTimestamp);
            lowRef.current?.setData(times.map((time, i) => ({ time, value: data.p10_close[i] })));
            highRef.current?.setData(times.map((time, i) => ({ time, value: data.p90_close[i] })));
            if (read.levels) {
                const line = (price: number, title: string, color: string) =>
                    realRef.current?.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
                [line(read.levels.tp, 'TP', '#26a69a'), line(read.levels.sl, 'SL', '#ef5350')].forEach(l => l && linesRef.current.push(l));
            }
            chartRef.current?.timeScale().fitContent();
            setResult(data);
            setMessage('');
        } catch (err) {
            setIsError(true);
            setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [side, tp, sl, symbol, sec, horizon, clearForecast]);

    const dec = result ? decimalsOf(result.last_close) : 2;
    const endLow = result ? result.p10_close[result.p10_close.length - 1] : 0;
    const endHigh = result ? result.p90_close[result.p90_close.length - 1] : 0;
    const higher = result ? Math.round(result.up_share * result.paths.length) : 0;
    const lean = result ? leanOf(result.up_share) : 'none';

    return (
        <div className='market-forecast'>
            <div className='market-forecast__head'>
                <h2>Market Forecast</h2>
                <span className='market-forecast__powered'>
                    Powered by{' '}
                    <a href='https://github.com/shiyu-coder/Kronos' target='_blank' rel='noreferrer'>
                        Kronos
                    </a>
                </span>
            </div>

            <div className='market-forecast__controls'>
                <label>
                    Market
                    <select value={symbol} onChange={e => setSymbol(e.target.value)} disabled={busy}>
                        {MARKETS.map(m => (
                            <option key={m.symbol} value={m.symbol}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Candle size
                    <select value={sec} onChange={e => setSec(Number(e.target.value))} disabled={busy}>
                        {TIMEFRAMES.map(t => (
                            <option key={t.sec} value={t.sec}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Look ahead
                    <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} disabled={busy}>
                        {HORIZONS.map(h => (
                            <option key={h} value={h}>
                                {h} candles (about {spanText(h * sec)})
                            </option>
                        ))}
                    </select>
                </label>
                <button type='button' className='market-forecast__run' onClick={run} disabled={busy}>
                    {busy ? 'Working…' : 'Run forecast'}
                </button>
            </div>

            <details className='market-forecast__levels'>
                <summary>Check a trade idea (optional)</summary>
                <div className='market-forecast__levels-row'>
                    <label>
                        Trade
                        <select value={side} onChange={e => setSide(e.target.value as 'none' | 'buy' | 'sell')} disabled={busy}>
                            <option value='none'>No trade</option>
                            <option value='buy'>Buy</option>
                            <option value='sell'>Sell</option>
                        </select>
                    </label>
                    <label>
                        Take profit price
                        <input inputMode='decimal' value={tp} onChange={e => setTp(e.target.value)} disabled={busy || side === 'none'} />
                    </label>
                    <label>
                        Stop loss price
                        <input inputMode='decimal' value={sl} onChange={e => setSl(e.target.value)} disabled={busy || side === 'none'} />
                    </label>
                </div>
            </details>

            {message && (
                <div className={`market-forecast__message${isError ? ' market-forecast__message--error' : ''}`} role='status'>
                    {message}
                </div>
            )}

            <div className='market-forecast__chart' ref={holder} />

            {result && (
                <div className='market-forecast__cards'>
                    <div className='market-forecast__card'>
                        <strong>
                            {lean === 'up' ? 'Leaning up' : lean === 'down' ? 'Leaning down' : 'No clear lean'}
                        </strong>
                        <span>
                            {higher} of {result.paths.length} sample paths end higher after about {spanText(horizon * sec)}.
                        </span>
                    </div>
                    <div className='market-forecast__card'>
                        <strong>Likely range at the end</strong>
                        <span>
                            {endLow.toFixed(dec)} to {endHigh.toFixed(dec)} (last price {result.last_close.toFixed(dec)}).
                        </span>
                    </div>
                    {result.levels && (
                        <div className='market-forecast__card'>
                            <strong>Your trade idea</strong>
                            <span>
                                {Math.round(result.levels.tp_first * 100)}% of the paths reached the take profit first, {Math.round(result.levels.sl_first * 100)}% hit the stop loss first, {Math.round(result.levels.neither * 100)}% reached neither.
                            </span>
                        </div>
                    )}
                </div>
            )}

            <p className='market-forecast__note'>
                The faded candles show the middle of {PATHS} possible futures; the dashed lines mark the 10% to 90% range of where the price could be. With only {PATHS} samples this is a rough guide, and the model cannot know about news. It is not financial advice and no result is guaranteed, so try ideas on a demo account first. Deriv synthetic indices are not offered because their prices come from a random number generator.
            </p>
        </div>
    );
};

export default MarketForecast;
