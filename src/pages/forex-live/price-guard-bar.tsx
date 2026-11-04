import { useEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import { armLevels, createBell, touched, type GuardLevels } from './price-guard';
import type { Side } from './trade-engine';

interface Props {
    symbol: string;
    /** The "Sell SL (if High swept)" and "Buy SL (if Low swept)" prices from the chart's analysis. */
    levels: GuardLevels;
    /** Opens the trade (the Trade panel's own stake, multiplier and options are used). */
    onTrigger: (side: Side) => void;
    disabled: boolean;
}

/**
 * Price Guard: switched on by hand while you are on the site. It watches every price tick of the market (a wick
 * counts the same as a full candle). When price reaches the "Sell SL" line it opens a SELL, and when it reaches
 * the "Buy SL" line it opens a BUY, then a bell rings until you stop it.
 */
const PriceGuard = ({ symbol, levels, onTrigger, disabled }: Props) => {
    const { ws, isConnected } = useDerivWS();
    const [on, setOn] = useState(false);
    const [armed, setArmed] = useState<GuardLevels | null>(null);
    const [fired, setFired] = useState<Side[]>([]);
    const [ringing, setRinging] = useState(false);
    const [last, setLast] = useState<number | null>(null);
    const bell = useRef<ReturnType<typeof createBell> | null>(null);
    if (!bell.current) bell.current = createBell();
    const lock = useRef<WakeLockSentinel | null>(null);
    const levelsRef = useRef(levels);
    levelsRef.current = levels;
    const triggerRef = useRef(onTrigger);
    triggerRef.current = onTrigger;
    const price = useRef<number | null>(null);

    // keep the last price handy so the levels can be checked when the guard is switched on
    useEffect(() => {
        if (!ws || !isConnected) return;
        let off = false;
        let stop: (() => void) | null = null;
        price.current = null;
        ws.subscribe({ ticks: symbol }, data => {
            const t = (data as { tick?: { quote?: number; bid?: number } }).tick;
            const p = Number(t?.quote ?? t?.bid);
            if (off || !Number.isFinite(p)) return;
            price.current = p;
            setLast(p);
        })
            .then(sub => (off ? sub.unsubscribe() : (stop = sub.unsubscribe)))
            .catch(() => {});
        return () => {
            off = true;
            stop?.();
        };
    }, [ws, isConnected, symbol]);

    // the check itself: every price received while the guard is on
    useEffect(() => {
        if (!on || !armed || last === null) return;
        const done = new Set(fired);
        const side = touched(armed, last, done);
        if (!side) return;
        setFired(f => [...f, side]);
        triggerRef.current(side);
        bell.current!.start();
        setRinging(true);
    }, [last, on, armed, fired]);

    // the guard belongs to one market: changing market switches it off
    useEffect(() => {
        setOn(false);
        setArmed(null);
        setFired([]);
    }, [symbol]);

    useEffect(
        () => () => {
            bell.current?.stop();
            void lock.current?.release?.();
        },
        []
    );

    const switchOn = () => {
        bell.current!.unlock();
        const a = armLevels(levelsRef.current, price.current);
        setArmed(a);
        setFired([]);
        setOn(true);
        try {
            void navigator.wakeLock?.request('screen').then(l => (lock.current = l)).catch(() => {});
        } catch {
            /* the screen may sleep on this device */
        }
    };
    const switchOff = () => {
        setOn(false);
        setArmed(null);
        void lock.current?.release?.();
        lock.current = null;
    };
    const silence = () => {
        bell.current!.stop();
        setRinging(false);
    };

    const have = levels.sell !== null || levels.buy !== null;
    const fmt = (n: number | null) => (n === null ? '–' : String(n));

    return (
        <div className={`fl-guard${on ? ' is-on' : ''}${ringing ? ' is-ringing' : ''}`}>
            {ringing && (
                <button type='button' className='fl-guard__silence' onClick={silence}>
                    🔔 Trade opened – tap to stop the bell
                </button>
            )}
            <button
                type='button'
                className='fl-guard__toggle'
                disabled={disabled || (!on && !have)}
                onClick={on ? switchOff : switchOn}
                title={
                    have
                        ? 'Opens a SELL at the Sell SL line and a BUY at the Buy SL line the moment price touches it, then rings a bell'
                        : 'Run the analysis first: the guard needs the Sell SL / Buy SL lines on the chart'
                }
            >
                {on ? 'Guard ON – tap to stop' : 'Price Guard'}
            </button>
            {on && armed && (
                <span className='fl-guard__info'>
                    SELL at {fmt(armed.sell)}
                    {fired.includes('SELL') ? ' ✓' : ''} · BUY at {fmt(armed.buy)}
                    {fired.includes('BUY') ? ' ✓' : ''}
                </span>
            )}
        </div>
    );
};

export default PriceGuard;
