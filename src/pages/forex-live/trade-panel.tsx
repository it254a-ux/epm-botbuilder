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
    useAnalysis: boolean;
    count: number;
}

const DEFAULTS: Prefs = { stake: '1', multiplier: 100, stopLoss: '', takeProfit: '', useAnalysis: true, count: 1 };

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
    const [stakeNote, setStakeNote] = useState('');

    // the page needs to know the multiplier, to look up the smallest stake that goes with it
    useEffect(() => {
        onMultiplier?.(prefs.multiplier);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefs.multiplier]);

    // a market with a bigger minimum stake: the stake moves up to that minimum and says so, instead of every click being refused
    useEffect(() => {
        setStakeNote('');
        if (minStake && Number(prefs.stake) + 1e-9 < minStake) {
            set({ stake: String(minStake) });
            setStakeNote(`Stake raised to ${minStake}: the smallest this market accepts.`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minStake, symbol]);

    useEffect(() => {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch {
            /* ignore */
        }
    }, [prefs]);

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
        const fromPlan = prefs.useAnalysis ? amountsFromPlan(plan, side, Number(prefs.stake), prefs.multiplier) : null;
        const trade: TradeInput = {
            side,
            symbol,
            currency,
            stake: Number(prefs.stake),
            multiplier: prefs.multiplier,
            stopLoss: fromPlan ? fromPlan.stopLoss : prefs.stopLoss.trim() ? Number(prefs.stopLoss) : null,
            takeProfit: fromPlan ? fromPlan.takeProfit : prefs.takeProfit.trim() ? Number(prefs.takeProfit) : null,
        };
        // every click is sent straight away; "trades per click" opens several at the same moment
        onTrade(Array.from({ length: prefs.count }, () => trade));
    };

    const name = marketName || symbol.replace(/^frx/, '');

    return (
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

            <div className='forex-live__buttons'>
                <button type='button' className='forex-live__go forex-live__go--buy' disabled={disabled} onClick={() => fire('BUY')}>
                    BUY <span>▲</span>
                    {prefs.count > 1 && <small>×{prefs.count}</small>}
                </button>
                <button type='button' className='forex-live__go forex-live__go--sell' disabled={disabled} onClick={() => fire('SELL')}>
                    SELL <span>▼</span>
                    {prefs.count > 1 && <small>×{prefs.count}</small>}
                </button>
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
                        onChange={e => set({ stake: e.target.value })}
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
                        placeholder='none'
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
                        placeholder='none'
                        value={prefs.takeProfit}
                        onChange={e => set({ takeProfit: e.target.value })}
                    />
                </label>
            </div>

            <label className='forex-live__auto'>
                <input type='checkbox' checked={prefs.useAnalysis} onChange={e => set({ useAnalysis: e.target.checked })} />
                <span>Set stop loss and take profit from the analysis</span>
            </label>
            {prefs.useAnalysis && (
                <p className='forex-live__hint'>
                    {(['BUY', 'SELL'] as Side[])
                        .map(sd => ({ sd, a: amountsFromPlan(plan, sd, Number(prefs.stake), prefs.multiplier) }))
                        .filter(x => x.a)
                        .map(x => `${x.sd}: stop loss ${x.a!.stopLoss}, take profit ${x.a!.takeProfit} ${currency}`)
                        .join(' · ') || 'No analysis plan for this market right now: your own stop loss / take profit below are used.'}
                </p>
            )}

            {stakeNote && (
                <p className='forex-live__warn' role='alert'>
                    {stakeNote}
                </p>
            )}

            <div className='forex-live__chips' aria-label='Quick stakes'>
                {STAKES.map(s => (
                    <button key={s} type='button' className={Number(prefs.stake) === s ? 'is-on' : ''} onClick={() => set({ stake: String(s) })}>
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
                No time limit: a trade stays open until you close it, or until its stop loss / take profit is reached. You can never lose more than the stake.
            </p>
        </section>
    );
};

export default TradePanel;
