import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { setLiveEquity } from '@/utils/live-equity';
import { useSharedPick } from '../forex-trader/shared-picks';
import CompareCharts from '../forex-trader/compare-charts';
import ForexTrader, { type ReportedPlan } from '../forex-trader/forex-trader';
import ActivityPanel from './activity-panel';
import { groupTotal, groupVerdict, type GuardGroup, type GuardLevels } from './price-guard';
import GroupsPanel, { type GroupRow } from './groups-panel';
import SweepSniper from './sweep-sniper';
import PositionsPanel from './positions-panel';
import QuickBar from './quick-bar';
import QuotesPanel from './quotes-panel';
import {
    BUY_COLOR,
    DEFAULT_SYMBOL,
    SELL_COLOR,
    positionLines,
    summarize,
    type Side,
    type TradeInput,
} from './trade-engine';
import TradePanel, { type FireOptions } from './trade-panel';
import { useForexLive, useMultipliers } from './use-forex-live';
import './forex-live.scss';

/**
 * Forex Live: trade forex with no fixed time. Every trade is a Deriv multiplier, so it stays open until you
 * close it. One click opens a trade straight away (no confirmation step, because the price moves while you
 * confirm), and as many can be open together as you like, buys and sells at the same time.
 * The chart is the Forex Trader's own chart (all its strategies and drawings), with the open trades drawn on it.
 */
// the markets of the phone's Quotes list (a market Deriv does not answer for just shows dashes)
const QUOTE_SYMBOLS = [
    'frxEURUSD',
    'frxGBPUSD',
    'frxUSDJPY',
    'frxUSDCHF',
    'frxAUDUSD',
    'frxUSDCAD',
    'frxNZDUSD',
    'frxEURGBP',
    'frxEURJPY',
    'frxGBPJPY',
    'frxAUDJPY',
    'frxXAUUSD',
];
type PhoneTab = 'quotes' | 'chart' | 'analysis' | 'trade' | 'history';
const TABS: Array<{ key: PhoneTab; label: string; icon: string }> = [
    { key: 'quotes', label: 'Quotes', icon: '⇅' },
    { key: 'chart', label: 'Chart', icon: '▥' },
    { key: 'trade', label: 'Trade', icon: '⌁' },
    { key: 'history', label: 'History', icon: '◷' },
];

const usePhone = () => {
    const query = '(max-width: 700px)';
    const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mq = window.matchMedia(query);
        const on = () => setPhone(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return phone;
};

const ForexLive = observer(() => {
    const phone = usePhone();
    const [tab, setTab] = useState<PhoneTab>('chart');
    const fireRef = useRef<((side: Side, opts?: FireOptions) => void) | null>(null);
    const { client } = useStore();
    const { isAuthorized, activeLoginid, authData } = useApiBase();

    // the market is shared with the Forex Trader page (see shared-picks)
    const [symbol, setSymbol] = useSharedPick('symbol', DEFAULT_SYMBOL, true);
    const [plan, setPlan] = useState<{ plan: ReportedPlan | null; symbol: string }>({ plan: null, symbol: '' });
    const [guardLevels, setGuardLevels] = useState<{ levels: GuardLevels; symbol: string }>({ levels: { sell: null, buy: null }, symbol: '' });
    const onWatch = useCallback((levels: GuardLevels, s: string) => setGuardLevels({ levels, symbol: s }), []);
    // the trades each touch of a Price Guard line opened, watched together
    const groups = useRef<GuardGroup[]>([]);
    const groupUid = useRef(0);
    const [groupsTick, setGroupsTick] = useState(0);
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

    const { positions, log, pending, openTrade, closeTrades, clearClosed, minStakes, probeMinStake, streamAt } = useForexLive(
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

    const allOpen = useMemo(() => summarize(positions), [positions]);

    // the header balance moves with the open trades (balance + stake + live profit of every open trade)
    useEffect(() => {
        const open = positions.filter(p => !p.closed && (!currency || p.currency === currency));
        if (!open.length || !activeLoginid) {
            setLiveEquity(null);
            return;
        }
        const round = (n: number) => Math.round(n * 100) / 100;
        setLiveEquity({
            loginid: activeLoginid,
            currency,
            count: open.length,
            value: round(open.reduce((t, p) => t + p.stake + (p.profit ?? 0), 0)),
            profit: round(open.reduce((t, p) => t + (p.profit ?? 0), 0)),
        });
    }, [positions, activeLoginid, currency]);
    useEffect(() => () => setLiveEquity(null), []);

    const trade = useCallback(
        (list: TradeInput[], onOpened?: (id: number) => void) => {
            // all sent at once; nothing waits for anything else
            list.forEach(t => void openTrade(t, onOpened));
        },
        [openTrade]
    );

    // Trades opened together (a Price Guard touch or one click with a total take profit / stop loss): one touch of a line opens the chosen number of trades and remembers them as a group
    const newGroup = useCallback((side: Side, takeProfit: number | null, stopLoss: number | null) => {
        const group: GuardGroup = { uid: ++groupUid.current, active: true, side, ids: [], takeProfit, stopLoss, done: false };
        groups.current = [...groups.current, group];
        return (id: number) => {
            group.ids.push(id);
            setGroupsTick(n => n + 1);
        };
    }, []);
    const guardFire = useCallback(
        (side: Side, s: { count: number; takeProfit: number | null; stopLoss: number | null }) => {
            fireRef.current?.(side, { count: s.count, onOpened: newGroup(side, s.takeProfit, s.stopLoss) });
        },
        [newGroup]
    );

    // ...and when their combined profit reaches the take profit (or the combined loss the stop loss), all of them close
    useEffect(() => {
        groups.current.forEach(g => {
            const verdict = groupVerdict(g, positions);
            if (!verdict) return;
            g.done = true;
            void closeTrades(positions.filter(p => g.ids.includes(p.id) && !p.closed));
        });
    }, [positions, closeTrades, groupsTick]);

    const groupRows = useMemo<GroupRow[]>(
        () =>
            groups.current
                .filter(g => !g.done && g.ids.length)
                .map(g => ({
                    uid: g.uid as number,
                    side: g.side,
                    open: positions.filter(p => !p.closed && g.ids.includes(p.id)).length,
                    total: groupTotal(g, positions),
                    takeProfit: g.takeProfit,
                    stopLoss: g.stopLoss,
                    active: g.active !== false,
                }))
                .filter(r => r.open > 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [positions, groupsTick]
    );
    const changeGroup = useCallback((uid: number, patch: { takeProfit?: number | null; stopLoss?: number | null; active?: boolean }) => {
        const g = groups.current.find(x => x.uid === uid);
        if (!g) return;
        Object.assign(g, patch);
        setGroupsTick(n => n + 1);
    }, []);
    const closeGroup = useCallback(
        (uid: number) => {
            const g = groups.current.find(x => x.uid === uid);
            if (!g) return;
            g.done = true;
            void closeTrades(positions.filter(p => g.ids.includes(p.id) && !p.closed));
            setGroupsTick(n => n + 1);
        },
        [closeTrades, positions]
    );

    const guardStatus = useMemo(() => {
        const live = groups.current.filter(g => !g.done && g.ids.length);
        if (!live.length) return '';
        const open = positions.filter(p => !p.closed && live.some(g => g.ids.includes(p.id))).length;
        const total = live.reduce((t, g) => t + groupTotal(g, positions), 0);
        const g = live[live.length - 1];
        const target = g.takeProfit ? ` / target ${g.takeProfit}` : '';
        return `${open} open · total ${total > 0 ? '+' : ''}${(Math.round(total * 100) / 100).toFixed(2)}${target}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [positions, groupsTick]);

    // the open trades on this market, drawn on the Forex Trader chart where they were entered
    // (the analysis plan and key levels are drawn by the Forex Trader chart itself)
    const lines = useMemo(() => positionLines(positions, symbol), [positions, symbol]);
    const tradesDrawn = lines.length > 0;

    const openCompare = useCallback(() => {
        rootRef.current?.scrollTo({ top: 0 });
        setCompare(true);
    }, []);

    const onPlan = useCallback((p: ReportedPlan | null, s: string) => setPlan({ plan: p, symbol: s }), []);

    return (
        <div
            className='forex-live'
            ref={rootRef}
            style={fitHeight ? { height: `${fitHeight}px` } : undefined}
            data-phone={phone ? 'on' : undefined}
            data-tab={phone ? tab : undefined}
        >
            {phone && tab === 'quotes' && (
                <QuotesPanel
                    symbols={QUOTE_SYMBOLS}
                    names={names}
                    current={symbol}
                    onPick={s => {
                        setSymbol(s);
                        setTab('chart');
                    }}
                />
            )}
            <div className='forex-live__top'>
                <div className='forex-live__chartcol'>
                    {phone && (
                        <QuickBar
                            symbol={symbol}
                            marketName={marketName}
                            disabled={!isAuthorized}
                            pending={pending}
                            onFire={side => fireRef.current?.(side)}
                            open={{ count: allOpen.open, profit: Math.round(allOpen.profit * 100) / 100, currency }}
                            streamAt={streamAt}
                            onOpenTrades={() => setTab('trade')}
                        />
                    )}
                    <ForexTrader
                        variant='page'
                        controlledSymbol={symbol}
                        onSymbolChange={setSymbol}
                        onPlan={onPlan}
                        onWatch={onWatch}
                        toolbarExtra={
                            <SweepSniper
                                symbol={symbol}
                                currency={currency}
                                levels={guardLevels.symbol === symbol ? guardLevels.levels : { sell: null, buy: null }}
                                onTrigger={guardFire}
                                status={guardStatus}
                                disabled={!isAuthorized}
                            />
                        }
                        extraLines={lines}
                        onMarkets={setNames}
                        resultHost={resultHost}
                        onOpenCompare={openCompare}
                        noAnalysis={phone}
                    />
                    {!phone && (
                    <button
                        type='button'
                        className='forex-live__compare-btn'
                        onClick={openCompare}
                        title='Open 2 or 4 charts of this market, each with its own candle size'
                    >
                        Compare charts
                    </button>
                    )}
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
                        fireRef={fireRef}
                        makeGroup={newGroup}
                    />

                    <div className='forex-live__pane' data-pane='trade'>
                        <GroupsPanel rows={groupRows} currency={currency} onChange={changeGroup} onCloseAll={closeGroup} />
                        <PositionsPanel
                            positions={positions}
                            currency={currency}
                            symbol={symbol}
                            onClose={list => void closeTrades(list)}
                            onClear={clearClosed}
                        />
                    </div>

                    <div className='forex-live__pane' data-pane='history'>
                        <ActivityPanel positions={positions} log={log} currency={currency} />
                    </div>

                    {/* the Forex Trader analysis shows here, under the trades, and the whole column scrolls */}
                    <div className='forex-live__pane' data-pane='analysis'>
                        <div className='forex-live__trader-host forex-trader forex-trader--panel' ref={setResultHost} />
                    </div>
                </aside>
            </div>

            {phone && (
                <nav className='fl-tabs' aria-label='Forex Live sections'>
                    {TABS.map(t => (
                        <button key={t.key} type='button' className={tab === t.key ? 'is-on' : ''} onClick={() => setTab(t.key)}>
                            <i aria-hidden>{t.icon}</i>
                            <span>{t.label}</span>
                        </button>
                    ))}
                </nav>
            )}

            {compare && (
                <CompareCharts
                    symbol={symbol}
                    marketName={marketName}
                    kind={symbol.startsWith('frx') ? 'forex' : 'synthetic'}
                    lines={lines}
                    onClose={() => setCompare(false)}
                />
            )}
        </div>
    );
});

export default ForexLive;
