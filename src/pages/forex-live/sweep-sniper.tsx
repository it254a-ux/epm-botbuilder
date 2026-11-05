import { useEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import { useMeasureContext } from '../forex-trader/measure-context';
import { GUARD_COUNTS, armLevels, createBell, touched, type GuardLevels } from './price-guard';
import { watchTicks } from './tick-feed';
import './sweep-sniper.scss';
import type { Side } from './trade-engine';

interface Props {
    symbol: string;
    currency: string;
    /** The "Sell SL (if High swept)" and "Buy SL (if Low swept)" prices from the chart's analysis. */
    levels: GuardLevels;
    /** Opens the trades (the Trade panel's own stake, multiplier and options are used). */
    onTrigger: (side: Side, settings: { count: number; stake: number | null; takeProfit: number | null; stopLoss: number | null }) => void;
    /** Live line about the trades the sniper opened, e.g. "3 open · total +2.40 / target 5". */
    status?: string;
    disabled: boolean;
}

const CLOSE_MS = 200;
/** A level this far (in percent of the price) or more away shows an empty meter; touching it shows a full one. */
const METER_RANGE_PCT = 0.5;

const Crosshair = () => (
    <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' aria-hidden>
        <circle cx='12' cy='12' r='6.5' />
        <circle cx='12' cy='12' r='1.6' fill='currentColor' stroke='none' />
        <path d='M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4' />
    </svg>
);

/**
 * Sweep Sniper: an auto-entry bot, switched on by hand while you are on the site. It watches every price tick of the
 * market (a wick counts like a full candle). When price reaches the "Sell SL" line it opens SELL trades, and when it
 * reaches the "Buy SL" line it opens BUY trades, then a bell rings until you stop it. The trades it opens are watched
 * together: an optional total take profit / stop loss closes them all.
 */
const SweepSniper = ({ symbol, currency, levels, onTrigger, status, disabled }: Props) => {
    const { ws, isConnected } = useDerivWS();
    const [open, setOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [on, setOn] = useState(false);
    const [armed, setArmed] = useState<GuardLevels | null>(null);
    const [fired, setFired] = useState<Side[]>([]);
    const [ringing, setRinging] = useState(false);
    const [last, setLast] = useState<number | null>(null);
    const [digits, setDigits] = useState<number | null>(null);
    const [count, setCount] = useState(1);
    const [stake, setStake] = useState('');
    const panel = useMeasureContext();
    const [tp, setTp] = useState('');
    const [sl, setSl] = useState('');
    const root = useRef<HTMLDivElement>(null);
    const bell = useRef<ReturnType<typeof createBell> | null>(null);
    if (!bell.current) bell.current = createBell();
    const wake = useRef<WakeLockSentinel | null>(null);
    const levelsRef = useRef(levels);
    levelsRef.current = levels;
    const triggerRef = useRef(onTrigger);
    triggerRef.current = onTrigger;
    const price = useRef<number | null>(null);
    const num = (v: string) => (v.trim() && Number(v) > 0 ? Number(v) : null);
    const settingsRef = useRef({ count: 1, stake: null as number | null, takeProfit: null as number | null, stopLoss: null as number | null });
    settingsRef.current = { count, stake: num(stake), takeProfit: num(tp), stopLoss: num(sl) };

    // the live price of this market (one stream shared with the rest of the page)
    useEffect(() => {
        if (!ws || !isConnected) return;
        let off = false;
        price.current = null;
        const stop = watchTicks(ws, symbol, data => {
            const t = (data as { tick?: { quote?: number; bid?: number; pip_size?: number } }).tick;
            const p = Number(t?.quote ?? t?.bid);
            if (off || !Number.isFinite(p)) return;
            price.current = p;
            setLast(p);
            if (typeof t?.pip_size === 'number') setDigits(t.pip_size);
        });
        return () => {
            off = true;
            stop();
        };
    }, [ws, isConnected, symbol]);

    // the check itself: every price received while the sniper is armed
    useEffect(() => {
        if (!on || !armed || last === null) return;
        const side = touched(armed, last, new Set(fired));
        if (!side) return;
        setFired(f => [...f, side]);
        triggerRef.current(side, settingsRef.current);
        bell.current!.start();
        setRinging(true);
    }, [last, on, armed, fired]);

    // the sniper belongs to one market: changing market disarms it
    useEffect(() => {
        setOn(false);
        setArmed(null);
        setFired([]);
        setLast(null);
    }, [symbol]);

    useEffect(
        () => () => {
            bell.current?.stop();
            void wake.current?.release?.();
        },
        []
    );

    const close = () => {
        if (!open || leaving) return;
        setLeaving(true);
        window.setTimeout(() => {
            setOpen(false);
            setLeaving(false);
        }, CLOSE_MS);
    };
    const toggle = () => (open ? close() : setOpen(true));

    // Escape or a tap outside folds the panel away (the sniper stays armed)
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
        const onDown = (e: PointerEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) close();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', onDown);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('pointerdown', onDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, leaving]);

    const arm = () => {
        bell.current!.unlock();
        setArmed(armLevels(levelsRef.current, price.current));
        setFired([]);
        setOn(true);
        try {
            void navigator.wakeLock?.request('screen').then(l => (wake.current = l)).catch(() => {});
        } catch {
            /* the screen may sleep on this device */
        }
    };
    const disarm = () => {
        setOn(false);
        setArmed(null);
        void wake.current?.release?.();
        wake.current = null;
    };
    const silence = () => {
        bell.current!.stop();
        setRinging(false);
    };

    const fmt = (n: number | null) => (n === null ? '—' : digits !== null ? n.toFixed(digits) : String(Number(n.toPrecision(8))));
    const shown = armed ?? levels;
    const have = levels.sell !== null || levels.buy !== null;

    const card = (side: Side, delay: number) => {
        const level = side === 'SELL' ? shown.sell : shown.buy;
        const live = side === 'SELL' ? levels.sell : levels.buy;
        const done = fired.includes(side);
        // before arming a level the price already passed will not be watched; after arming only the locked levels are
        const passed = !on && live !== null && last !== null && (side === 'SELL' ? live <= last : live >= last);
        const none = level === null;
        const away = level !== null && last !== null ? (Math.abs(level - last) / last) * 100 : null;
        const meter = done ? 1 : away === null ? 0 : Math.max(0.04, 1 - away / METER_RANGE_PCT);
        const cls = `sn-lvl sn-lvl--${side === 'SELL' ? 'sell' : 'buy'}${done ? ' is-fired' : ''}${none || passed ? ' is-off' : ''}`;
        return (
            <div className={cls} style={{ ['--d' as string]: `${delay}s` }}>
                <div className='sn-lvl__top'>
                    <b>{side}</b>
                    <span>{side === 'SELL' ? 'when price rises to' : 'when price falls to'}</span>
                </div>
                <div className='sn-lvl__price'>{fmt(level)}</div>
                <div className='sn-lvl__meter'>
                    <i style={{ transform: `scaleX(${meter})` }} />
                </div>
                <div className='sn-lvl__foot'>
                    {done ? '✓ Fired' : none ? (on ? 'Not watched' : 'Waiting for the analysis') : passed ? 'Price already past it' : away !== null ? `${away.toFixed(2)}% away` : '…'}
                </div>
            </div>
        );
    };

    return (
        <div ref={root} className={`sniper${on ? ' is-armed' : ''}${ringing ? ' is-ringing' : ''}${open ? ' is-open' : ''}`}>
            <button type='button' className='sniper__trigger' onClick={toggle} aria-expanded={open} title='Sweep Sniper: automatic entry when price reaches the sweep levels'>
                <span className='sniper__led' />
                <span className='sniper__icon'>
                    <Crosshair />
                </span>
                <span className='sniper__name'>Sweep Sniper</span>
                <span className='sniper__state'>{on ? (status ? status.split(' · ')[0] : 'ARMED') : 'OFF'}</span>
                <svg className='sniper__chev' viewBox='0 0 12 12' width='10' height='10' aria-hidden>
                    <path d='M2 4.2 6 8l4-3.8' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
                </svg>
            </button>

            {open && (
                <div className={`sniper__pop${leaving ? ' is-leaving' : ''}`} role='dialog' aria-label='Sweep Sniper'>
                    <header className='sn-head'>
                        <span className='sn-head__icon'>
                            <Crosshair />
                        </span>
                        <div>
                            <h4>Sweep Sniper</h4>
                            <p>Automatic entry the moment price reaches a sweep level</p>
                        </div>
                        <button type='button' className='sn-head__x' onClick={close} aria-label='Close'>
                            ×
                        </button>
                    </header>

                    {ringing && (
                        <button type='button' className='sn-alert' onClick={silence}>
                            <span>🔔</span> Trades opened — tap to silence the bell
                        </button>
                    )}

                    <div className='sn-levels'>
                        {card('SELL', 0.06)}
                        {card('BUY', 0.12)}
                    </div>

                    {status && (
                        <div className='sn-total' style={{ ['--d' as string]: '0.16s' }}>
                            <i /> {status}
                        </div>
                    )}

                    <div className='sn-set' style={{ ['--d' as string]: '0.18s' }}>
                        <div className='sn-set__row'>
                            <span>Trades per trigger</span>
                            <div className='sn-chips' role='radiogroup' aria-label='Trades per trigger'>
                                {GUARD_COUNTS.map(c => (
                                    <button key={c} type='button' role='radio' aria-checked={count === c} className={count === c ? 'is-on' : ''} disabled={on} onClick={() => setCount(c)}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className='sn-stake' title='The amount put into each trade. Leave it empty to use the stake of the Trade panel.'>
                            <span>Stake per trade</span>
                            <div>
                                <em>{currency || '$'}</em>
                                <input
                                    type='number'
                                    min='0'
                                    step='any'
                                    inputMode='decimal'
                                    placeholder={panel ? `${panel.stake} (Trade panel)` : 'Trade panel stake'}
                                    value={stake}
                                    disabled={on}
                                    onChange={e => setStake(e.target.value)}
                                />
                                {(num(stake) ?? panel?.stake) ? (
                                    <b>
                                        {count} × {num(stake) ?? panel?.stake} = {Math.round(count * (num(stake) ?? panel?.stake ?? 0) * 100) / 100}
                                    </b>
                                ) : null}
                            </div>
                        </label>
                        <div className='sn-set__pair'>
                            <label title='Optional: when all the trades together are at this profit, every one of them closes'>
                                <span>Total take profit</span>
                                <div>
                                    <em>{currency || '$'}</em>
                                    <input type='number' min='0' step='any' inputMode='decimal' placeholder='Off' value={tp} onChange={e => setTp(e.target.value)} />
                                </div>
                            </label>
                            <label title='Optional: when all the trades together are at this loss, every one of them closes'>
                                <span>Total stop loss</span>
                                <div>
                                    <em>{currency || '$'}</em>
                                    <input type='number' min='0' step='any' inputMode='decimal' placeholder='Off' value={sl} onChange={e => setSl(e.target.value)} />
                                </div>
                            </label>
                        </div>
                    </div>

                    <button
                        type='button'
                        className={`sn-go${on ? ' is-on' : ''}`}
                        disabled={disabled || (!on && !have)}
                        onClick={on ? disarm : arm}
                        style={{ ['--d' as string]: '0.24s' }}
                    >
                        <span className='sn-go__shine' />
                        {disabled && !on ? 'Sign in to arm' : on ? 'Disarm Sniper' : have ? `Arm Sniper · ${count} trade${count === 1 ? '' : 's'}` : 'Waiting for analysis levels…'}
                    </button>

                    <p className='sn-foot'>Uses the stake and multiplier set in the Trade panel. Works only while this page stays open.</p>
                </div>
            )}
        </div>
    );
};

export default SweepSniper;
