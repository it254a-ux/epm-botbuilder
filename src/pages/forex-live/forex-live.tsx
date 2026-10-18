import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { useSharedPick } from '../forex-trader/shared-picks';
import CompareCharts from '../forex-trader/compare-charts';
import ForexTrader, { type ReportedPlan } from '../forex-trader/forex-trader';
import PositionsPanel from './positions-panel';
import {
    BUY_COLOR,
    DEFAULT_SYMBOL,
    SELL_COLOR,
    positionLines,
    type TradeInput,
} from './trade-engine';
import TradePanel from './trade-panel';
import { useForexLive, useMultipliers } from './use-forex-live';
import './forex-live.scss';

/**
 * Forex Live: trade forex with no fixed time. Every trade is a Deriv multiplier, so it stays open until you
 * close it. One click opens a trade straight away (no confirmation step, because the price moves while you
 * confirm), and as many can be open together as you like, buys and sells at the same time.
 * The chart is the Forex Trader's own chart (all its strategies and drawings), with the open trades drawn on it.
 */
const ForexLive = observer(() => {
    const { client } = useStore();
    const { isAuthorized, activeLoginid, authData } = useApiBase();

    // the market is shared with the Forex Trader page (see shared-picks)
    const [symbol, setSymbol] = useSharedPick('symbol', DEFAULT_SYMBOL, true);
    const [plan, setPlan] = useState<{ plan: ReportedPlan | null; symbol: string }>({ plan: null, symbol: '' });
    const [compare, setCompare] = useState(false);
    const [resultHost, setResultHost] = useState<HTMLElement | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [fitHeight, setFitHeight] = useState<number | null>(null);

    // keep the page exactly as tall as the visible area, so nothing runs past the bottom of the screen
    useEffect(() => {
        const measure = () => {
            const el = rootRef.current;
            if (!el) return;
            const vh = window.visualViewport?.height ?? window.innerHeight;
            const top = el.getBoundingClientRect().top;
            // the tab may be hidden (kept alive in the background): a hidden page has no position, so leave the CSS height alone
            setFitHeight(el.offsetParent === null ? null : Math.max(320, Math.floor(vh - top - 4)));
        };
        measure();
        const t = window.setTimeout(measure, 300);
        const t2 = window.setTimeout(measure, 1200);
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        window.visualViewport?.addEventListener('resize', measure);
        return () => {
            window.clearTimeout(t);
            window.clearTimeout(t2);
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
            window.visualViewport?.removeEventListener('resize', measure);
        };
    }, []);

    const currency = client?.currency || (authData as any)?.currency || '';

    const { positions, log, pending, openTrade, closeTrades, minStakes, probeMinStake } = useForexLive(
        isAuthorized,
        activeLoginid
    );
    const multipliers = useMultipliers(symbol, isAuthorized);

    // readable market names, the multiplier chosen in the trade panel, and a notice when the market changes
    const [names, setNames] = useState<Record<string, string>>({});
    const [multiplier, setMultiplier] = useState(0);
    const [marketNotice, setMarketNotice] = useState('');
    const marketName = names[symbol] || symbol.replace(/^frx/, '');
    const first = useRef(true);
    useEffect(() => {
        // not on the first load: only when the person (or the chart) really changes the market
        if (first.current) {
            first.current = false;
            return;
        }
        setMarketNotice(`Market changed to ${marketName}. Trades now open on this market.`);
        const t = window.setTimeout(() => setMarketNotice(''), 8000);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol]);

    // look up the smallest stake of the chosen market (Deriv's answer to a price quote with a tiny stake; nothing is bought)
    useEffect(() => {
        if (isAuthorized && currency && multiplier) void probeMinStake(symbol, currency, multiplier);
    }, [isAuthorized, currency, symbol, multiplier, probeMinStake]);

    const here = useMemo(() => {
        const open = positions.filter(p => !p.closed && p.symbol === symbol);
        return {
            count: open.length,
            buys: open.filter(p => p.side === 'BUY').length,
            sells: open.filter(p => p.side === 'SELL').length,
            profit: Math.round(open.reduce((t, p) => t + (p.profit ?? 0), 0) * 100) / 100,
        };
    }, [positions, symbol]);

    const trade = useCallback(
        (list: TradeInput[]) => {
            // all sent at once; nothing waits for anything else
            list.forEach(t => void openTrade(t));
        },
        [openTrade]
    );

    // the open trades on this market, drawn on the Forex Trader chart where they were entered
    // (the analysis plan and key levels are drawn by the Forex Trader chart itself)
    const lines = useMemo(() => positionLines(positions, symbol), [positions, symbol]);
    const tradesDrawn = lines.length > 0;

    const onPlan = useCallback((p: ReportedPlan | null, s: string) => setPlan({ plan: p, symbol: s }), []);

    return (
        <div className='forex-live' ref={rootRef} style={fitHeight ? { height: `${fitHeight}px` } : undefined}>
            <div className='forex-live__top'>
                <div className='forex-live__chartcol'>
                    <ForexTrader
                        variant='page'
                        controlledSymbol={symbol}
                        onSymbolChange={setSymbol}
                        onPlan={onPlan}
                        initialMode='mtf'
                        extraLines={lines}
                        onMarkets={setNames}
                        resultHost={resultHost}
                    />
                    <button
                        type='button'
                        className='forex-live__compare-btn'
                        onClick={() => {
                            rootRef.current?.scrollTo({ top: 0 });
                            setCompare(true);
                        }}
                        title='Open 2 or 4 charts of this market, each with its own candle size'
                    >
                        Compare charts
                    </button>
                    {tradesDrawn && (
                        <div className='forex-live__legend'>
                            <span style={{ color: BUY_COLOR }}>— Your BUY trades</span>
                            <span style={{ color: SELL_COLOR }}>— Your SELL trades</span>
                            <em>at their entry price, with live profit</em>
                        </div>
                    )}
                </div>

                <aside className='forex-live__side'>
                    <TradePanel
                        symbol={symbol}
                        currency={currency}
                        multipliers={multipliers}
                        disabled={!isAuthorized}
                        pending={pending}
                        onTrade={trade}
                        marketName={marketName}
                        minStake={minStakes[`${symbol}|${multiplier}`] ?? null}
                        onMultiplier={setMultiplier}
                        notice={marketNotice}
                        openHere={here}
                        plan={plan.symbol === symbol ? plan.plan : null}
                    />

                    <PositionsPanel
                        positions={positions}
                        currency={currency}
                        symbol={symbol}
                        onClose={list => void closeTrades(list)}
                    />

                    {log.length > 0 && (
                        <section className='forex-live__card forex-live__log' aria-live='polite'>
                            <header className='forex-live__card-head'>
                                <h3>Activity</h3>
                            </header>
                            <ul>
                                {log.slice(0, 8).map(l => (
                                    <li key={l.id} className={`is-${l.kind}`}>
                                        {l.text}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* the Forex Trader analysis shows here, under the trades, and the whole column scrolls */}
                    <div className='forex-live__trader-host forex-trader forex-trader--panel' ref={setResultHost} />
                </aside>
            </div>

            {compare && (
                <CompareCharts symbol={symbol} marketName={marketName} lines={lines} onClose={() => setCompare(false)} />
            )}
        </div>
    );
});

export default ForexLive;
