import type { Side } from './trade-engine';

/** The two prices the Price Guard watches: a SELL when price rises to `sell`, a BUY when it falls to `buy`. */
export interface GuardLevels {
    sell: number | null;
    buy: number | null;
}

export const hasLevel = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Locks the levels when the guard is switched on. A level price has already passed is left out, so switching the
 * guard on can never open a trade straight away: only a level still ahead of the price is watched.
 */
export function armLevels(levels: GuardLevels, price: number | null): GuardLevels {
    return {
        sell: hasLevel(levels.sell) && (price === null || levels.sell > price) ? levels.sell : null,
        buy: hasLevel(levels.buy) && (price === null || levels.buy < price) ? levels.buy : null,
    };
}

/**
 * Which side (if any) the price has just reached. A tick is every price move, so a thin wick counts exactly like
 * a full candle. Each side fires once (`done` holds the sides already used).
 */
export function touched(armed: GuardLevels, price: number, done: ReadonlySet<Side>): Side | null {
    if (!Number.isFinite(price)) return null;
    if (hasLevel(armed.sell) && !done.has('SELL') && price >= armed.sell) return 'SELL';
    if (hasLevel(armed.buy) && !done.has('BUY') && price <= armed.buy) return 'BUY';
    return null;
}

/** A bell that rings again and again until stopped. Needs a tap on the page first (browsers insist), which the guard's own switch is. */
export function createBell() {
    let ctx: AudioContext | null = null;
    let timer = 0;
    const ring = () => {
        if (!ctx) return;
        const t = ctx.currentTime;
        [880, 1318].forEach((hz, i) => {
            const osc = ctx!.createOscillator();
            const gain = ctx!.createGain();
            osc.type = 'sine';
            osc.frequency.value = hz;
            gain.gain.setValueAtTime(0.0001, t + i * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.5, t + i * 0.18 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 1.1);
            osc.connect(gain).connect(ctx!.destination);
            osc.start(t + i * 0.18);
            osc.stop(t + i * 0.18 + 1.2);
        });
    };
    return {
        /** Call from a tap so the browser allows sound later. */
        unlock() {
            try {
                const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                if (!ctx && AC) ctx = new AC();
                void ctx?.resume();
            } catch {
                /* no sound available */
            }
        },
        start() {
            this.unlock();
            window.clearInterval(timer);
            ring();
            timer = window.setInterval(ring, 1500);
            try {
                navigator.vibrate?.([300, 150, 300]);
            } catch {
                /* not on this device */
            }
        },
        stop() {
            window.clearInterval(timer);
            timer = 0;
        },
        get ringing() {
            return timer !== 0;
        },
    };
}
