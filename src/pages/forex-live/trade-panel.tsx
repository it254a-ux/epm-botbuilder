import { useEffect, useState } from 'react';
import { amountsFromPlan, type PlanLevels, type Side, type TradeInput } from './trade-engine';

interface Props {
    symbol: string;
    currency: string;
    multipliers: number[];
    /** Not signed in yet / not connected: the buttons stay visible but do nothing. */
    disabled: boolean;
    /** How many requests are on their way to Deriv right now. */
    pending: number;
    onTrade: (trades: TradeInput[]) => void;
    /** Readable name of the market (for example "Volatility 75 (1s) Index"). */
    marketName?: string;
    /** The smallest stake this market accepts, once known. */
    minStake?: number | null;
    /** Tells the page which multiplier is chosen (the minimum stake is looked up for it). */
    onMultiplier?: (multiplier: number) => void;
    /** A short message at the top, for example when the market was just changed. */
    notice?: string;
    /** The contracts that are open on this market right now. */
    /** The analysis plan for this market, when there is one: its stop loss and take profit can be used for the trade. */
    plan?: PlanLevels | null;
    openHere?: { count: number; buys: number; sells: number; profit: number };
}

const PREFS_KEY = 'epm_forex_live_prefs';
const STAKES = [1, 5, 10, 25, 50];
const COUNTS = [1, 2, 3, 5, 10];

interface Prefs {
    stake: string;
    multiplier: number;
    stopLoss: string;
    takeProfit: string;
    /** Use the analysis plan's stop loss and take profit (when it has one for the side clicked). */
    usePlan: boolean;
    count: number;
    /** The stake the person chose on each market (so it comes back when they return to that market). */
    stakeBy: Record<string, string>;
}

const DEFAULTS: Prefs = { stake: '1', multiplier: 100, stopLoss: '', takeProfit: '', usePlan: false, count: 1, stakeBy: {} };

const loadPrefs = (): Prefs => {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        /* private mode or blocked storage: start from the defaults */
    }
    return DEFAULTS;
};

const nearest = (list: number[], want: number): number =>
    list.length ? list.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)) : want;

const TradePanel = ({ symbol, currency, multipliers, disabled, pending, onTrade, marketName, minStake, onMultiplier, notice, openHere, plan }: Props) => {
    const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
    const set = (patch: Partial<Prefs>) => setPrefs(p => ({ ...p, ...patch }));
    // a stake the person types or picks is remembered for this market
    const setStake = (stake: string) => setPrefs(p => ({ ...p, stake, stakeBy: { ...p.stakeBy, [symbol]: stake } }));
    const [stakeNote, setStakeNote] = useState('');

    // the page needs to know the multiplier, to look up the smallest stake that goes with it
    useEffect(() => {
        onMultiplier?.(prefs.multiplier);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefs.multiplier]);

    // On a market, the stake box fills itself with the smallest stake Deriv accepts there. It is only a starting point:
    // the person can clear it and type any amount (at or above that minimum), and that amount is remembered for the market.
    useEffect(() => {
        setStakeNote('');
        const mine = prefs.stakeBy?.[symbol];
        if (mine !== undefined && mine !== '') {
            if (mine !== prefs.stake) set({ stake: mine });
            if (minStake && Number(mine) + 1e-9 < minStake) {
                set({ stake: String(minStake) });
            }
        } else if (minStake) {
            set({ stake: String(minStake) });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minStake, symbol]);

    // a market with different allowed multipliers: move to the closest one
    useEffect(() => {
        if (multipliers.length && !multipliers.includes(prefs.multiplier)) set({ multiplier: nearest(multipliers, prefs.multiplier) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [multipliers]);

    const fire = (side: Side) => {
        if (disabled) return;
        if (minStake && Number(prefs.stake) + 1e-9 < minStake) {
            setStakeNote(`The smallest stake on this market is ${minStake}. Raise your stake to ${minStake} or more.`);
            return;
        }
        // Stop loss and take profit are both optional. What you type in the boxes is used as it is; the analysis
        // plan only fills a box you left empty, and only when you switched that option on (it is off by default).
        const fromPlan = prefs.usePlan ? amountsFromPlan(plan, side, Number(prefs.stake), prefs.multiplier) : null;
        const own = (v: string) => (v.trim() && Number(v) > 0 ? Number(v) : null);
        const stake = Number(prefs.stake);
        let stopLoss = own(prefs.stopLoss) ?? (fromPlan && fromPlan.stopLoss > 0 ? fromPlan.stopLoss : null);
        // A stop loss at or above the stake can never trigger (a multiplier cannot lose more than its stake), and a
        // missing stop loss is allowed anyway: so the trade goes ahead without it instead of being refused.
        if (stopLoss !== null && stopLoss >= stake) {
            setStakeNote(`Stop loss ignored: ${stopLoss} is not below your stake of ${stake}. The trade was sent without a stop loss.`);
            stopLoss = null;
        }
        const trade: TradeInput = {
            side,
            symbol,
            currency,
            stake,
            multiplier: prefs.multiplier,
            stopLoss,
            takeProfit: own(prefs.takeProfit) ?? (fromPlan && fromPlan.takeProfit > 0 ? fromPlan.takeProfit : null),
        };
        // every click is sent straight away; "trades per click" opens several at the same moment
        onTrade(Array.from({ length: prefs.count }, () => trade));
    };

    const name = marketName || symbol.replace(/^frx/, '');

    return (
        <div className='forex-live__tradewrap'>
            {/* BUY and SELL stay pinned at the top while the side column scrolls, so a trade is always one tap away */}
            <div className='forex-live__buttons forex-live__buttons--pinned'>
                <button type='button' className='forex-live__go forex-live__go--buy' disabled={disabled} onClick={() => fire('BUY')}>
                    BUY <span>▲</span>
                    {prefs.count > 1 && <small>×{prefs.count}</small>}
                </button>
                <button type='button' className='forex-live__go forex-live__go--sell' disabled={disabled} onClick={() => fire('SELL')}>
                    SELL <span>▼</span>
                    {prefs.count > 1 && <small>×{prefs.count}</small>}
                </button>
            </div>

        <section className='forex-live__card forex-live__trade'>
            <header className='forex-live__card-head'>
                <h3>Trade {name}</h3>
                {pending > 0 && <span className='forex-live__sending'>sending {pending}…</span>}
            </header>

            {notice && (
                <p className='forex-live__flash' role='status'>
                    {notice}
                </p>
            )}

            <div className='forex-live__market' aria-label='This market'>
                <span className='forex-live__pill'>Multiplier x{prefs.multiplier}</span>
                <span className='forex-live__pill'>{minStake ? `Min stake ${minStake} ${currency}` : 'Min stake: checking…'}</span>
                <span className={`forex-live__pill forex-live__pill--open${openHere && openHere.count ? ' is-live' : ''}`}>
                    {openHere && openHere.count
                        ? `${openHere.count} open here · ▲${openHere.buys} ▼${openHere.sells} · ${openHere.profit > 0 ? '+' : ''}${openHere.profit.toFixed(2)}`
                        : 'No contracts open here'}
                </span>
            </div>

            <div className='forex-live__grid'>
                <label>
                    <span>Stake ({currency || '…'})</span>
                    <input
                        type='number'
                        min='0'
                        step='any'
                        inputMode='decimal'
                        value={prefs.stake}
                        onChange={e => setStake(e.target.value)}
                    />
                </label>
                <label>
                    <span>Multiplier</span>
                    <select value={prefs.multiplier} onChange={e => set({ multiplier: Number(e.target.value) })}>
                        {(multipliers.includes(prefs.multiplier) ? multipliers : [...multipliers, prefs.multiplier].sort((a, b) => a - b)).map(m => (
                            <option key={m} value={m}>
                                x{m}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Stop loss ({currency || '…'})</span>
                    <input
                        type='number'
                        min='0'
                        step='any'
                        inputMode='decimal'
                        placeholder='Optional'
                        value={prefs.stopLoss}
                        onChange={e => set({ stopLoss: e.target.value })}
                    />
                </label>
                <label>
                    <span>Take profit ({currency || '…'})</span>
                    <input
                        type='number'
                        min='0'
                        step='any'
                        inputMode='decimal'
                        placeholder='Optional'
                        value={prefs.takeProfit}
                        onChange={e => set({ takeProfit: e.target.value })}
                    />
                </label>
            </div>

            <label className='forex-live__auto'>
                <input type='checkbox' checked={prefs.usePlan} onChange={e => set({ usePlan: e.target.checked })} />
                <span>Fill empty stop loss / take profit from the analysis</span>
            </label>
            {prefs.usePlan && (
                <p className='forex-live__hint'>
                    {(['BUY', 'SELL'] as Side[])
                        .map(sd => ({ sd, a: amountsFromPlan(plan, sd, Number(prefs.stake), prefs.multiplier) }))
                        .filter(x => x.a)
                        .map(x => `${x.sd}: stop loss ${x.a!.stopLoss}, take profit ${x.a!.takeProfit} ${currency}`)
                        .join(' · ') || 'No analysis plan for this market right now: the trade goes with only what you typed (or none).'}
                </p>
            )}

            {stakeNote && (
                <p className={/^Stop loss ignored/.test(stakeNote) ? 'forex-live__note' : 'forex-live__warn'} role='alert'>
                    {stakeNote}
                </p>
            )}

            <div className='forex-live__chips' aria-label='Quick stakes'>
                {STAKES.map(s => (
                    <button key={s} type='button' className={Number(prefs.stake) === s ? 'is-on' : ''} onClick={() => setStake(String(s))}>
                        {s}
                    </button>
                ))}
            </div>

            <label className='forex-live__count'>
                <span>Trades per click</span>
                <select value={prefs.count} onChange={e => set({ count: Number(e.target.value) })}>
                    {COUNTS.map(c => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </label>

            <p className='forex-live__hint'>
                Stays open until you close it or its stop loss / take profit is reached. You can never lose more than the stake.
            </p>
        </section>
        </div>
    );
};

export default TradePanel;
