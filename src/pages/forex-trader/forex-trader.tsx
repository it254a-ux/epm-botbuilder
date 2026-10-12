import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import ChartView, { type ChartViewHandle } from './chart-view';
import { analyse, marketKind, type Analysis, type Candle, type SweepStrategyId } from './engine';
import { STRATEGIES, STRATEGY_CATEGORIES } from './strategies';
import './forex-trader.scss';

interface SymbolInfo {
    underlying_symbol: string;
    underlying_symbol_name: string;
    market: string;
    market_display_name?: string;
    pip_size: number;
    exchange_is_open: number;
    is_trading_suspended: number;
}

interface AiResult {
    status: 'waiting_for_market' | 'waiting_for_pov' | 'buy_ready' | 'sell_ready' | 'invalidated';
    confidence: number;
    reasoning: string;
    warnings: string[];
    model?: string;
}

interface Outcome {
    analysis: Analysis;
    ai: AiResult | null;
    aiError: string | null;
    at: number;
}

const TIMEFRAMES = [
    { label: '1m', sec: 60 },
    { label: '5m', sec: 300 },
    { label: '15m', sec: 900 },
    { label: '1h', sec: 3600 },
];

const STATUS_TEXT: Record<AiResult['status'], string> = {
    waiting_for_market: 'Waiting for the market to be good',
    waiting_for_pov: 'Waiting for the point of view',
    buy_ready: 'BUY setup ready',
    sell_ready: 'SELL setup ready',
    invalidated: 'Setup invalidated',
};

/** Status shown when the AI is unavailable: based on the code's own result. */
function codeStatus(a: Analysis): AiResult['status'] {
    switch (a.state) {
        case 'ready':
            return a.plan?.side === 'BUY' ? 'buy_ready' : 'sell_ready';
        case 'waiting_for_sweep':
        case 'sweep_in_progress':
            return 'waiting_for_pov';
        case 'invalidated':
        case 'target_reached':
        case 'expired':
            return 'invalidated';
        default:
            return 'waiting_for_market';
    }
}

interface CheckItem {
    label: string;
    state: 'yes' | 'no' | 'wait';
}

function checklist(a: Analysis, marketClosed: boolean): CheckItem[] {
    const swept = !!a.sweep;
    const live = a.state === 'ready';
    const items: CheckItem[] = [
        { label: 'Market is open', state: marketClosed ? 'no' : 'yes' },
        { label: 'Reference range found', state: a.range ? 'yes' : 'no' },
        {
            label: 'Range edge swept (price pushed through it)',
            state: swept || a.state === 'sweep_in_progress' ? 'yes' : 'wait',
        },
        { label: 'A candle closed back inside the range', state: swept ? 'yes' : 'wait' },
    ];
    if (a.plan) {
        items.push({
            label: `Reward at least equal to risk (1 : ${a.plan.rr.toFixed(2)})`,
            state: a.plan.rr >= 1 ? 'yes' : 'no',
        });
        items.push({
            label: 'Setup still fresh (stop and target not hit, not expired)',
            state: live ? 'yes' : 'no',
        });
    } else {
        items.push({ label: 'Entry, stop loss and take profit confirmed', state: 'wait' });
    }
    return items;
}

const fmtTime = (t: number) => {
    const d = new Date(t * 1000);
    return `${d.toUTCString().slice(5, 11)} ${d.toISOString().slice(11, 16)} GMT`;
};

const ForexTrader = ({ variant = 'page' }: { variant?: 'page' | 'panel' }) => {
    const { ws, isConnected } = useDerivWS();
    const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
    const [symbol, setSymbol] = useState('R_25');
    const [tf, setTf] = useState(900);
    const [category, setCategory] = useState(STRATEGY_CATEGORIES[0]);
    const [strategyId, setStrategyId] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [lastPrice, setLastPrice] = useState<number | null>(null);

    const chartRef = useRef<ChartViewHandle>(null);
    const candlesRef = useRef<Candle[]>([]);
    const wrapRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [fitHeight, setFitHeight] = useState<number | null>(null);

    // ---- keep the page exactly as tall as the visible area (same approach as the Analysis Tool)
    useEffect(() => {
        const measure = () => {
            const el = rootRef.current;
            if (variant === 'panel' || !el || window.innerWidth > 900) return setFitHeight(null);
            const vh = window.visualViewport?.height ?? window.innerHeight;
            setFitHeight(Math.max(320, Math.floor(vh - el.getBoundingClientRect().top)));
        };
        measure();
        const t = window.setTimeout(measure, 300);
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        window.visualViewport?.addEventListener('resize', measure);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
            window.visualViewport?.removeEventListener('resize', measure);
        };
    }, [variant]);

    // ---- markets list
    useEffect(() => {
        if (!ws || !isConnected) return;
        let off = false;
        ws.send<{ active_symbols?: SymbolInfo[] }>({ active_symbols: 'full' })
            .then(res => {
                if (off) return;
                const list = (res.active_symbols ?? []).filter(s => s.underlying_symbol);
                setSymbols(list);
            })
            .catch(() => {});
        return () => {
            off = true;
        };
    }, [ws, isConnected]);

    const grouped = useMemo(() => {
        const m = new Map<string, SymbolInfo[]>();
        for (const s of symbols) {
            const g = s.market_display_name ?? s.market ?? 'Other';
            if (!m.has(g)) m.set(g, []);
            m.get(g)!.push(s);
        }
        m.forEach(list => list.sort((a, b) => a.underlying_symbol_name.localeCompare(b.underlying_symbol_name)));
        return Array.from(m.entries());
    }, [symbols]);

    const info = symbols.find(s => s.underlying_symbol === symbol);
    const pipSize = info ? Math.max(0, Math.round(-Math.log10(info.pip_size || 0.01))) : 2;
    const kind = marketKind(info?.market);
    const closed = !!info && (info.exchange_is_open === 0 || info.is_trading_suspended === 1);

    // ---- candles (history + live)
    useEffect(() => {
        if (!ws || !isConnected || !symbol) return;
        let off = false;
        let unsub: (() => void) | null = null;
        setLoading(true);
        setLoadError(null);
        setOutcome(null);
        chartRef.current?.drawAnalysis(null, []);
        candlesRef.current = [];
        const count = Math.min(5000, Math.ceil((15 * 86400) / tf));

        ws.subscribe(
            { ticks_history: symbol, style: 'candles', granularity: tf, end: 'latest', count, adjust_start_time: 1 },
            data => {
                if (off) return;
                const d = data as {
                    error?: { message?: string };
                    candles?: Array<{ epoch: number; open: number; high: number; low: number; close: number }>;
                    ohlc?: { open_time: number; open: string | number; high: string | number; low: string | number; close: string | number };
                };
                if (d.error) {
                    setLoadError(d.error.message ?? 'Could not load candles');
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
                    candlesRef.current = list;
                    chartRef.current?.setCandles(list);
                    setLastPrice(list.length ? list[list.length - 1].close : null);
                    setLoading(false);
                } else if (d.ohlc) {
                    const c: Candle = {
                        time: Number(d.ohlc.open_time),
                        open: Number(d.ohlc.open),
                        high: Number(d.ohlc.high),
                        low: Number(d.ohlc.low),
                        close: Number(d.ohlc.close),
                    };
                    const arr = candlesRef.current;
                    const last = arr[arr.length - 1];
                    if (last && last.time === c.time) arr[arr.length - 1] = c;
                    else if (!last || c.time > last.time) arr.push(c);
                    chartRef.current?.updateCandle(c);
                    setLastPrice(c.close);
                }
            }
        )
            .then(sub => {
                if (off) sub.unsubscribe();
                else unsub = sub.unsubscribe;
            })
            .catch(err => {
                if (!off) {
                    setLoadError(err instanceof Error ? err.message : 'Connection error');
                    setLoading(false);
                }
            });

        return () => {
            off = true;
            if (unsub) unsub();
        };
    }, [ws, isConnected, symbol, tf]);

    const categoryStrategies = STRATEGIES.filter(s => s.category === category);
    const strategy = STRATEGIES.find(s => s.id === strategyId);
    const canAnalyse = !!strategy?.ready && !loading && !loadError && !closed && !busy && isConnected;

    const runAnalysis = useCallback(async () => {
        if (!strategy?.ready) return;
        setBusy(true);
        try {
            // Only finished candles count: a candle still forming could change the result.
            const now = Math.floor(Date.now() / 1000);
            const closedCandles = candlesRef.current.filter(c => c.time + tf <= now);
            const analysis = analyse(strategy.id as SweepStrategyId, closedCandles, kind);
            chartRef.current?.drawAnalysis(analysis, closedCandles);
            // wait a frame so the lines are painted before the screenshot
            await new Promise(r => requestAnimationFrame(() => r(null)));
            const image = chartRef.current?.screenshot() ?? null;

            let ai: AiResult | null = null;
            let aiError: string | null = null;
            try {
                const resp = await fetch('/api/forex-analyse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image,
                        meta: {
                            market: info?.underlying_symbol_name ?? symbol,
                            symbol,
                            timeframe: TIMEFRAMES.find(t => t.sec === tf)?.label,
                            marketType: kind,
                            utcNow: new Date().toISOString(),
                        },
                        analysis: {
                            strategy: analysis.strategyName,
                            state: analysis.state,
                            status: analysis.statusText,
                            range: analysis.range,
                            sweep: analysis.sweep,
                            plan: analysis.plan,
                            lastPrice: analysis.lastPrice,
                            atr: analysis.atr,
                            warnings: analysis.warnings,
                            plannedTrades: analysis.watch,
                            session: analysis.sessionNow,
                        },
                    }),
                });
                const json = await resp.json().catch(() => ({}));
                if (resp.ok) ai = json as AiResult;
                else aiError = json?.error ?? `AI review unavailable (${resp.status})`;
            } catch {
                aiError = 'AI review unavailable (no connection to the server).';
            }
            setOutcome({ analysis, ai, aiError, at: Date.now() });
        } finally {
            setBusy(false);
        }
    }, [strategy, tf, kind, info, symbol]);

    // ---- draggable floating Analyse button
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
    useEffect(() => {
        const w = wrapRef.current;
        if (w && !pos) setPos({ x: Math.max(8, w.clientWidth - 210), y: 44 });
    }, [pos, loading]);

    const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!pos) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false };
    };
    const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        const w = wrapRef.current;
        if (!d || !w) return;
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 6) d.moved = true;
        if (!d.moved) return;
        const x = Math.min(Math.max(0, e.clientX - d.dx), w.clientWidth - 110);
        const y = Math.min(Math.max(0, e.clientY - d.dy), w.clientHeight - 40);
        setPos({ x, y });
    };
    const onUp = () => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved && canAnalyse) runAnalysis();
    };

    const status: AiResult['status'] | null = outcome ? (outcome.ai?.status ?? codeStatus(outcome.analysis)) : null;
    const plan = outcome?.analysis.plan;
    const fmt = (n: number) => n.toFixed(pipSize);
    const tone = status === 'buy_ready' ? 'buy' : status === 'sell_ready' ? 'sell' : status === 'invalidated' ? 'bad' : 'wait';

    return (
        <div
            ref={rootRef}
            className={`forex-trader${variant === 'panel' ? ' forex-trader--panel' : ''}`}
            style={fitHeight ? { height: `${fitHeight}px` } : undefined}
        >
            <div className='forex-trader__controls'>
                <label>
                    <span>Market</span>
                    <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                        {grouped.length === 0 && <option value={symbol}>{symbol}</option>}
                        {grouped.map(([group, list]) => (
                            <optgroup key={group} label={group}>
                                {list.map(s => (
                                    <option key={s.underlying_symbol} value={s.underlying_symbol}>
                                        {s.underlying_symbol_name}
                                        {s.exchange_is_open === 0 ? ' (closed)' : ''}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </label>
                <label className='forex-trader__tf'>
                    <span>Timeframe</span>
                    <select value={tf} onChange={e => setTf(Number(e.target.value))}>
                        {TIMEFRAMES.map(t => (
                            <option key={t.sec} value={t.sec}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Category</span>
                    <select
                        value={category}
                        onChange={e => {
                            setCategory(e.target.value);
                            const first = STRATEGIES.find(s => s.category === e.target.value && s.ready);
                            setStrategyId((first ?? STRATEGIES.find(s => s.category === e.target.value))!.id);
                        }}
                    >
                        {STRATEGY_CATEGORIES.map(c => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Strategy</span>
                    <select value={strategyId} onChange={e => setStrategyId(Number(e.target.value))}>
                        {categoryStrategies.map(s => (
                            <option key={s.id} value={s.id} disabled={!s.ready}>
                                {s.id}. {s.name}
                                {s.ready ? '' : ' — coming soon'}
                            </option>
                        ))}
                    </select>
                </label>
                <button type='button' className='forex-trader__analyse-btn' disabled={!canAnalyse} onClick={runAnalysis}>
                    {busy ? 'Analysing…' : 'Analyse'}
                </button>
            </div>

            <div className='forex-trader__chart-wrap' ref={wrapRef}>
                <ChartView ref={chartRef} pipSize={pipSize} />
                <div className='forex-trader__chart-info'>
                    <b>{info?.underlying_symbol_name ?? symbol}</b>
                    <span>{TIMEFRAMES.find(t => t.sec === tf)?.label}</span>
                    {lastPrice !== null && <span>{fmt(lastPrice)}</span>}
                    <em>times in GMT</em>
                </div>
                {loading && !loadError && <div className='forex-trader__overlay'>Loading chart…</div>}
                {loadError && <div className='forex-trader__overlay forex-trader__overlay--error'>{loadError}</div>}
                {closed && !loadError && (
                    <div className='forex-trader__overlay forex-trader__overlay--closed'>
                        Market closed — no live analysis. Pick an open market (Derived indices run all week).
                    </div>
                )}
                {pos && variant !== 'panel' && (
                    <button
                        type='button'
                        className={`forex-trader__float${canAnalyse ? '' : ' is-disabled'}`}
                        style={{ left: pos.x, top: pos.y }}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        title='Drag to move, tap to analyse'
                        aria-label='Analyse'
                    >
                        {busy ? '…' : '⚡ Analyse'}
                    </button>
                )}
                {status && (
                    <div className={`forex-trader__badge forex-trader__badge--${tone}`}>{STATUS_TEXT[status]}</div>
                )}
            </div>

            <div className='forex-trader__result'>
                {!outcome && (
                    <p className='forex-trader__hint'>
                        Choose a market and a strategy, then tap <b>Analyse</b>. The tool calculates the exact levels with
                        code, draws them on the chart, and asks Gemini whether the setup looks clean. Signals only — it
                        never trades, and no strategy wins every time.
                    </p>
                )}
                {outcome && (
                    <>
                        <div className='forex-trader__result-head'>
                            <span className={`forex-trader__pill forex-trader__pill--${tone}`}>
                                {status && STATUS_TEXT[status]}
                            </span>
                            {outcome.ai && <span className='forex-trader__conf'>Confidence {outcome.ai.confidence}%</span>}
                        </div>
                        {status && STATUS_TEXT[status] !== outcome.analysis.statusText && (
                            <p className='forex-trader__code-status'>{outcome.analysis.statusText}</p>
                        )}

                        <h4 className='forex-trader__h'>Setup details</h4>
                        <dl className='forex-trader__facts'>
                            <dt>Strategy</dt>
                            <dd>{outcome.analysis.strategyName}</dd>
                            <dt>Market</dt>
                            <dd>{info?.underlying_symbol_name ?? symbol}</dd>
                            <dt>Trade timeframe</dt>
                            <dd>
                                {TIMEFRAMES.find(t => t.sec === tf)?.label} candles (enter on a candle close)
                            </dd>
                            <dt>Session now</dt>
                            <dd>
                                {outcome.analysis.sessionNow}
                                {outcome.analysis.lastCandleTime ? ` · ${fmtTime(outcome.analysis.lastCandleTime)}` : ''}
                            </dd>
                            {outcome.analysis.lastPrice !== null && (
                                <>
                                    <dt>Price now</dt>
                                    <dd>{fmt(outcome.analysis.lastPrice)}</dd>
                                </>
                            )}
                            {outcome.analysis.range && (
                                <>
                                    <dt>Reference range</dt>
                                    <dd>
                                        {outcome.analysis.range.label} High {fmt(outcome.analysis.range.high)} · Low{' '}
                                        {fmt(outcome.analysis.range.low)}
                                    </dd>
                                    <dt>Range measured</dt>
                                    <dd>
                                        {fmtTime(outcome.analysis.range.startTime)} →{' '}
                                        {fmtTime(outcome.analysis.range.endTime)}
                                        {outcome.analysis.range.note ? ` (${outcome.analysis.range.note})` : ''}
                                    </dd>
                                </>
                            )}
                            {outcome.analysis.sweep && (
                                <>
                                    <dt>Sweep</dt>
                                    <dd>
                                        {outcome.analysis.sweep.side === 'high' ? 'High' : 'Low'} swept to{' '}
                                        {fmt(outcome.analysis.sweep.extreme)}, closed back inside{' '}
                                        {fmtTime(outcome.analysis.sweep.confirmTime)}
                                    </dd>
                                </>
                            )}
                            {outcome.analysis.candlesLeft !== null && outcome.analysis.state === 'ready' && (
                                <>
                                    <dt>Valid for</dt>
                                    <dd>
                                        about {outcome.analysis.candlesLeft} more candles (
                                        {Math.round((outcome.analysis.candlesLeft * tf) / 60)} min)
                                    </dd>
                                </>
                            )}
                        </dl>

                        {plan && (
                            <>
                                <h4 className='forex-trader__h'>Trade plan ({plan.side})</h4>
                                <div className='forex-trader__grid'>
                                    <div className='is-entry'>
                                        <span>Entry</span>
                                        <b>{fmt(plan.entry)}</b>
                                    </div>
                                    <div className='is-sl'>
                                        <span>Stop loss</span>
                                        <b>{fmt(plan.stopLoss)}</b>
                                    </div>
                                    <div className='is-tp'>
                                        <span>Take profit</span>
                                        <b>{fmt(plan.takeProfit)}</b>
                                    </div>
                                    <div>
                                        <span>Risk : Reward</span>
                                        <b>1 : {plan.rr.toFixed(2)}</b>
                                    </div>
                                    <div>
                                        <span>Risk (price)</span>
                                        <b>{fmt(plan.risk)}</b>
                                    </div>
                                    <div>
                                        <span>Midpoint</span>
                                        <b>{fmt(plan.midpoint)}</b>
                                    </div>
                                </div>
                            </>
                        )}

                        {outcome.analysis.watch && outcome.analysis.range && (
                            <>
                                <h4 className='forex-trader__h'>Planned trades (dashed lines, not active yet)</h4>
                                <p className='forex-trader__muted'>
                                    Price is closer to the {outcome.analysis.watch.nearest === 'sell' ? 'HIGH' : 'LOW'}, so
                                    that side is the one to watch first.
                                </p>
                                {([outcome.analysis.watch.sell, outcome.analysis.watch.buy] as const).map(sc => (
                                    <div
                                        key={sc.side}
                                        className={`forex-trader__scenario forex-trader__scenario--${sc.side === 'SELL' ? 'sell' : 'buy'}${
                                            (sc.side === 'SELL') === (outcome.analysis.watch!.nearest === 'sell') ? ' is-near' : ''
                                        }`}
                                    >
                                        <b>
                                            If the {sc.side === 'SELL' ? 'HIGH' : 'LOW'} is swept → {sc.side}
                                        </b>
                                        <ol>
                                            <li>
                                                Price pushes {sc.side === 'SELL' ? 'above' : 'below'} {fmt(sc.trigger)}
                                            </li>
                                            <li>A {TIMEFRAMES.find(t => t.sec === tf)?.label} candle closes back inside the range</li>
                                            <li>
                                                Enter {sc.side} near {fmt(sc.entry)}, stop loss {fmt(sc.stopLoss)} (beyond the
                                                sweep), take profit {fmt(sc.takeProfit)}
                                            </li>
                                        </ol>
                                        <span className='forex-trader__muted'>
                                            RR about 1 : {sc.rr.toFixed(2)} · price is {fmt(sc.distance)} away
                                            {sc.distanceAtr !== null ? ` (${sc.distanceAtr.toFixed(1)}× average candle size)` : ''}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}

                        <h4 className='forex-trader__h'>Before you enter</h4>
                        <ul className='forex-trader__check'>
                            {checklist(outcome.analysis, closed).map(c => (
                                <li key={c.label} className={`is-${c.state}`}>
                                    <span>{c.state === 'yes' ? '✔' : c.state === 'no' ? '✖' : '○'}</span> {c.label}
                                </li>
                            ))}
                        </ul>

                        {outcome.ai?.reasoning && <p className='forex-trader__reasoning'>{outcome.ai.reasoning}</p>}
                        {[...(outcome.analysis.warnings ?? []), ...(outcome.ai?.warnings ?? [])].map((w, i) => (
                            <p key={i} className='forex-trader__warn'>
                                ⚠ {w}
                            </p>
                        ))}
                        {outcome.aiError && (
                            <p className='forex-trader__warn'>
                                AI review unavailable: {outcome.aiError} Showing the code-calculated result only.
                            </p>
                        )}
                        <p className='forex-trader__muted'>
                            Analysed {fmtTime(Math.floor(outcome.at / 1000))}. Signals only: no strategy wins every time.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default ForexTrader;
