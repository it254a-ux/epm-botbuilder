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
const OLDER_PAGE = 1000; // candles fetched each time the chart is dragged back to its oldest candle
const MAX_WAIT_MS = 8 * 60 * 1000;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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
async function loadCandles(symbol: string, sec: number, end: number | 'latest' = 'latest', count = HISTORY): Promise<Bar[]> {
    const socket = new DerivWS();
    try {
        await within(socket.connect(), 12000, 'Could not reach the market data. Please check your internet and try again.');
        const d = await within(
            socket.send<CandleMsg>({ ticks_history: symbol, style: 'candles', granularity: sec, end, count, adjust_start_time: 1 }),
            15000,
            'Loading candles took too long. Please try again.'
        );
        if (!d.candles?.length) {
            if (end !== 'latest') return [];
            throw new Error('No candles came back for this market.');
        }
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
    const olderKeyRef = useRef({ symbol: '', sec: 0 }); // identifies which market/size the loaded candles belong to
    const barsRef = useRef<Bar[]>([]); // every real candle on the chart, oldest first
    const olderBusyRef = useRef(false);
    const noOlderRef = useRef(false); // true once the market has no earlier candles
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

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
        // dragging back near the oldest candle loads earlier ones, so the history never runs out
        const onRange = (range: { from: number; to: number } | null) => {
            const bars = barsRef.current;
            if (!range || range.from > 30 || bars.length === 0 || olderBusyRef.current || noOlderRef.current) return;
            const key = olderKeyRef.current;
            olderBusyRef.current = true;
            loadCandles(key.symbol, key.sec, bars[0].time - 1, OLDER_PAGE)
                .then(older => {
                    if (!aliveRef.current || key !== olderKeyRef.current) return;
                    const have = barsRef.current[0]?.time ?? Infinity;
                    const fresh = older.filter(b => b.time < have);
                    if (fresh.length === 0) {
                        noOlderRef.current = true;
                        return;
                    }
                    barsRef.current = fresh.concat(barsRef.current);
                    // the chart keeps the same candles in view when earlier ones are added on the left
                    realRef.current?.setData(barsRef.current.map(toPoint));
                })
                .catch(() => undefined) // a failed attempt is simply tried again on the next drag
                .finally(() => {
                    olderBusyRef.current = false;
                });
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
        const resize = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
        resize.observe(el);
        return () => {
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
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
        const key = { symbol, sec };
        olderKeyRef.current = key;
        barsRef.current = [];
        noOlderRef.current = false;
        loadCandles(symbol, sec)
            .then(bars => {
                if (off) return;
                barsRef.current = bars;
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
            // keep any older candles already loaded, only the newest part is replaced
            const keep = barsRef.current.filter(b => b.time < closed[0].time);
            barsRef.current = keep.concat(closed);
            realRef.current?.setData(barsRef.current.map(toPoint));

            setMessage('Starting Kronos…');
            const started = await fetch('/api/kronos-forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candles: closed.slice(-HISTORY).map(b => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close })),
                    pred_len: horizon,
                    paths: PATHS,
                    levels: read.levels ?? undefined,
                }),
            });
            const job = (await started.json().catch(() => null)) as { job?: string; error?: string } | null;
            if (!started.ok || !job?.job) throw new Error(job?.error ?? 'The forecast service is offline right now. Please try again later.');

            // a slow computer can need a few minutes, so check back every few seconds instead of waiting on one request
            const t0 = Date.now();
            let failures = 0;
            let data: ForecastResult | null = null;
            while (!data) {
                await sleep(3000);
                if (!aliveRef.current) return;
                if (Date.now() - t0 > MAX_WAIT_MS) throw new Error('The forecast is taking much longer than expected. Please try again later.');
                setMessage(`Kronos is working… ${Math.round((Date.now() - t0) / 1000)} s (it can take a few minutes on a slow computer).`);
                try {
                    const pr = await fetch(`/api/kronos-forecast?id=${job.job}`);
                    const p = (await pr.json().catch(() => null)) as { status?: string; result?: ForecastResult; error?: string } | null;
                    if (!pr.ok || !p) {
                        const fatal = pr.status === 410 || pr.status === 429 || pr.status === 400;
                        failures += 1;
                        if (fatal || failures >= 3) throw new Error(p?.error ?? 'The forecast service is offline right now. Please try again later.');
                    } else if (p.status === 'error') {
                        throw new Error(p.error ?? 'The model hit a problem. Please try again.');
                    } else if (p.status === 'done' && p.result && Array.isArray(p.result.paths)) {
                        data = p.result;
                    } else {
                        failures = 0;
                    }
                } catch (err) {
                    if (err instanceof TypeError) {
                        failures += 1; // a network blip: try again, give up after three in a row
                        if (failures >= 3) throw new Error('Lost the connection while waiting. Please try again.');
                    } else throw err;
                }
            }

            const forecast: ForecastResult = data;
            ghostRef.current?.setData(medianBars(forecast.paths).map(toPoint));
            const times = forecast.paths[0].map(c => c.t as UTCTimestamp);
            lowRef.current?.setData(times.map((time, i) => ({ time, value: forecast.p10_close[i] })));
            highRef.current?.setData(times.map((time, i) => ({ time, value: forecast.p90_close[i] })));
            if (read.levels) {
                const line = (price: number, title: string, color: string) =>
                    realRef.current?.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
                [line(read.levels.tp, 'TP', '#26a69a'), line(read.levels.sl, 'SL', '#ef5350')].forEach(l => l && linesRef.current.push(l));
            }
            // frame the recent candles and the forecast, even when much older history has been loaded
            const last = barsRef.current.length - 1 + times.length;
            chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, barsRef.current.length - 160), to: last + 3 });
            setResult(forecast);
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
