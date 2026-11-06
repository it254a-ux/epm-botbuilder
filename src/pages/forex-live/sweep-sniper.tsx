import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import { useMeasureContext } from '../forex-trader/measure-context';
import { GUARD_COUNTS, armLevels, createBell, touched, tradeFor, type ArmedLevels, type SniperMode } from './price-guard';
import type { GuardLevels } from './price-guard';
import { loadSniper, saveSniper, shouldResume } from './sniper-storage';
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
    const [armed, setArmed] = useState<ArmedLevels | null>(null);
    const [fired, setFired] = useState<Side[]>([]);
    const [ringing, setRinging] = useState(false);
    const [last, setLast] = useState<number | null>(null);
    const [digits, setDigits] = useState<number | null>(null);
    // what was set (and whether it was armed) before the page was refreshed
    const saved = useRef(loadSniper());
    const pendingResume = useRef(shouldResume(saved.current, symbol));
    const [mode, setMode] = useState<SniperMode>(saved.current?.mode ?? 'reverse');
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const [resumed, setResumed] = useState(false);
    const [soundReady, setSoundReady] = useState(true);
    const [count, setCount] = useState(saved.current?.count ?? 1);
    const [stake, setStake] = useState(saved.current?.stake ?? '');
    const panel = useMeasureContext();
    const [tp, setTp] = useState(saved.current?.tp ?? '');
    const [sl, setSl] = useState(saved.current?.sl ?? '');
    const root = useRef<HTMLDivElement>(null);
    // the panel is never taller than the room under its button: it scrolls inside itself instead of running off the screen
    const [room, setRoom] = useState<number | null>(null);
    useLayoutEffect(() => {
        if (!open) return;
        const fit = () => {
            const r = root.current?.getBoundingClientRect();
            if (r) setRoom(Math.max(220, Math.floor(window.innerHeight - r.bottom - 22)));
        };
        fit();
        window.addEventListener('resize', fit);
        window.addEventListener('scroll', fit, true);
        return () => {
            window.removeEventListener('resize', fit);
            window.removeEventListener('scroll', fit, true);
        };
    }, [open]);
    const bell = useRef<ReturnType<typeof createBell> | null>(null);
    if (!bell.current) bell.current = createBell();
    const wake = useRef<WakeLockSentinel | null>(null);
    const levelsRef = useRef(levels);
    levelsRef.current = levels;
    const triggerRef = useRef(onTrigger);
    triggerRef.current = onTrigger;
    const price = useRef<number | null>(null);
    // the check runs straight inside the price feed's callback (through these refs), not after a screen redraw,
    // so a touch is acted on the instant the tick arrives
    const armedRef = useRef<ArmedLevels | null>(null);
    const firedRef = useRef<Set<Side>>(new Set());
    const onRef = useRef(false);
    const applyArmed = (a: ArmedLevels | null) => {
        armedRef.current = a;
        setArmed(a);
    };
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
            if (onRef.current && armedRef.current) {
                const line = touched(armedRef.current, p, firedRef.current);
                if (line) {
                    firedRef.current.add(line);
                    setFired([...firedRef.current]);
                    triggerRef.current(tradeFor(line, modeRef.current), settingsRef.current);
                    bell.current!.start();
                    setRinging(true);
                }
            }
            setLast(p);
            if (typeof t?.pip_size === 'number') setDigits(t.pip_size);
        });
        return () => {
            off = true;
            stop();
        };
    }, [ws, isConnected, symbol]);

    // the chart's lines move as the analysis updates: while armed, the sniper follows them, so it always watches
    // the price of the line you see (a side that already fired stays done)
    useEffect(() => {
        if (!on) return;
        applyArmed(armLevels(levels, price.current));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levels.sell, levels.buy, on]);

    // the sniper belongs to one market: changing market disarms it
    const firstSymbol = useRef(true);
    useEffect(() => {
        if (firstSymbol.current) {
            firstSymbol.current = false; // the first run is the page opening, not a market change
            return;
        }
        pendingResume.current = false;
        onRef.current = false;
        firedRef.current = new Set();
        setOn(false);
        applyArmed(null);
        setFired([]);
        setLast(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol]);

    // remember the settings and the armed state, for a refresh (an armed sniper waiting to come back counts as armed)
    useEffect(() => {
        saveSniper({
            symbol,
            count,
            stake,
            tp,
            sl,
            on: on || pendingResume.current,
            mode,
            fired: [...firedRef.current],
            savedAt: Date.now(),
        });
    }, [symbol, count, stake, tp, sl, on, mode, fired]);

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

    const arm = (restoredFired?: Side[]) => {
        bell.current!.unlock();
        firedRef.current = new Set(restoredFired ?? []);
        applyArmed(armLevels(levelsRef.current, price.current));
        setFired([...firedRef.current]);
        onRef.current = true;
        setOn(true);
        try {
            void navigator.wakeLock?.request('screen').then(l => (wake.current = l)).catch(() => {});
        } catch {
            /* the screen may sleep on this device */
        }
    };
    const disarm = () => {
        pendingResume.current = false;
        onRef.current = false;
        setOn(false);
        applyArmed(null);
        void wake.current?.release?.();
        wake.current = null;
    };
    // after a refresh the sniper switches itself on again as soon as it is signed in, has a price and has its lines;
    // it never trades at that moment (it only watches what the price does from there)
    useEffect(() => {
        if (!pendingResume.current || on || disabled || last === null) return;
        if (levels.sell === null && levels.buy === null) return;
        pendingResume.current = false;
        arm(saved.current?.fired);
        setResumed(true);
        // the browser only allows the bell after a tap on the page: the first tap or key press turns it on
        setSoundReady(false);
        const ready = () => {
            bell.current!.unlock();
            setSoundReady(true);
            window.removeEventListener('pointerdown', ready);
            window.removeEventListener('keydown', ready);
        };
        window.addEventListener('pointerdown', ready);
        window.addEventListener('keydown', ready);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [last, levels.sell, levels.buy, disabled, on]);

    const silence = () => {
        bell.current!.stop();
        setRinging(false);
    };

    const fmt = (n: number | null) => (n === null ? '—' : digits !== null ? n.toFixed(digits) : String(Number(n.toPrecision(8))));
    const shown = armed ?? levels;
    const have = levels.sell !== null || levels.buy !== null;

    // one small box per line: what it will trade, the line's price, and how close price is
    const card = (line: Side, delay: number) => {
        const side = tradeFor(line, mode);
        const level = line === 'SELL' ? shown.sell : shown.buy;
        const done = fired.includes(line);
        const from = line === 'SELL' ? armed?.sellFrom : armed?.buyFrom;
        const none = level === null;
        const away = level !== null && last !== null ? (Math.abs(level - last) / last) * 100 : null;
        const meter = done ? 1 : away === null ? 0 : Math.max(0.04, 1 - away / METER_RANGE_PCT);
        const cls = `sn-lvl sn-lvl--${side === 'SELL' ? 'sell' : 'buy'}${done ? ' is-fired' : ''}${none ? ' is-off' : ''}`;
        const foot = done
            ? '✓ Fired'
            : none
              ? on
                  ? 'No line'
                  : 'Waiting…'
              : away !== null
                ? `${away.toFixed(2)}%${on && from ? (from === 'above' ? ' ↓' : ' ↑') : ''}`
                : '…';
        return (
            <div className={cls} style={{ ['--d' as string]: `${delay}s` }} title={`${side} when price touches the ${line === 'SELL' ? 'Sell' : 'Buy'} SL line`}>
                <div className='sn-lvl__row'>
                    <b>{side}</b>
                    <span className='sn-lvl__price'>{fmt(level)}</span>
                </div>
                <div className='sn-lvl__meter'>
                    <i style={{ transform: `scaleX(${meter})` }} />
                </div>
                <div className='sn-lvl__foot'>
                    <span>{line === 'SELL' ? 'Sell SL' : 'Buy SL'}</span>
                    <span>{foot}</span>
                </div>
            </div>
        );
    };

    return (
        <div ref={root} className={`sniper${on ? ' is-armed' : ''}${ringing ? ' is-ringing' : ''}${open ? ' is-open' : ''}`}>
            <button
                type='button'
                className='sniper__trigger'
                onClick={toggle}
                aria-expanded={open}
                data-state={on ? 'armed' : pendingResume.current ? 'resuming' : 'off'}
                title={`Sniper: ${on ? 'armed' : pendingResume.current ? 'switching back on' : 'off'}${on && status ? ` · ${status}` : ''}${on && !soundReady ? ' · tap the page once for sound' : ''}`}
            >
                <span className='sniper__led' />
                <span className='sniper__icon'>
                    <Crosshair />
                </span>
                <span className='sniper__name'>Sniper</span>
                <svg className='sniper__chev' viewBox='0 0 12 12' width='10' height='10' aria-hidden>
                    <path d='M2 4.2 6 8l4-3.8' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
                </svg>
            </button>

            {open && (
                <div className={`sniper__pop${leaving ? ' is-leaving' : ''}`} role='dialog' aria-label='Sniper' style={room ? { maxHeight: room } : undefined}>
                    <header className='sn-head'>
                        <span className='sn-head__icon'>
                            <Crosshair />
                        </span>
                        <div>
                            <h4>Sniper</h4>
                            <p>Auto-entry when price touches a sweep line</p>
                        </div>
                        <button type='button' className='sn-head__x' onClick={close} aria-label='Close'>
                            ×
                        </button>
                    </header>

                    {resumed && (
                        <div className='sn-resumed'>
                            Switched back on after the page refreshed.{!soundReady ? ' Tap anywhere once to turn the bell on.' : ''}
                        </div>
                    )}

                    {ringing && (
                        <button type='button' className='sn-alert' onClick={silence}>
                            <span>🔔</span> Trades opened — tap to silence the bell
                        </button>
                    )}

                    <div className='sn-mode' role='radiogroup' aria-label='What to trade at a line'>
                        <button type='button' role='radio' aria-checked={mode === 'reverse'} className={mode === 'reverse' ? 'is-on' : ''} disabled={on} onClick={() => setMode('reverse')}>
                            Reversal
                        </button>
                        <button type='button' role='radio' aria-checked={mode === 'breakout'} className={mode === 'breakout' ? 'is-on' : ''} disabled={on} onClick={() => setMode('breakout')}>
                            Breakout
                        </button>
                    </div>
                    <p className='sn-mode__hint'>
                        {mode === 'reverse' ? 'Trades back from the line: SELL at the Sell SL, BUY at the Buy SL.' : 'Trades through the line: BUY when the Sell SL breaks, SELL when the Buy SL breaks.'}
                    </p>

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
                        onClick={on ? disarm : () => arm()}
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
