import type { Side } from './trade-engine';

/** The two prices the Sweep Sniper watches: the "Sell SL" line (a SELL when price touches it) and the "Buy SL" line (a BUY). */
export interface GuardLevels {
    sell: number | null;
    buy: number | null;
}

/** The levels being watched, with the side of each that the price was on when it was set. */
export interface ArmedLevels extends GuardLevels {
    sellFrom?: 'below' | 'above';
    buyFrom?: 'below' | 'above';
}

export const hasLevel = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Sets the levels to watch. A level is "touched" when price reaches it from the side it is on now, whichever
 * direction that is: a line above the price is touched on the way up, a line below it on the way down. A price
 * exactly on a line is left out (nothing to wait for), so switching on can never open a trade straight away.
 */
export function armLevels(levels: GuardLevels, price: number | null): ArmedLevels {
    const one = (level: number | null, fallback: 'below' | 'above') => {
        if (!hasLevel(level)) return { level: null, from: undefined };
        if (price === null) return { level, from: fallback };
        if (level === price) return { level: null, from: undefined };
        return { level, from: price < level ? ('below' as const) : ('above' as const) };
    };
    const sell = one(levels.sell, 'below');
    const buy = one(levels.buy, 'above');
    return { sell: sell.level, buy: buy.level, sellFrom: sell.from, buyFrom: buy.from };
}

/**
 * Which side (if any) the price has just touched. A tick is every price move, so a thin wick counts exactly like
 * a full candle. Each side fires once (`done` holds the sides already used).
 */
export function touched(armed: ArmedLevels, price: number, done: ReadonlySet<Side>): Side | null {
    if (!Number.isFinite(price)) return null;
    const hit = (level: number | null, from: 'below' | 'above' | undefined) =>
        hasLevel(level) && from !== undefined && (from === 'below' ? price >= level : price <= level);
    if (!done.has('SELL') && hit(armed.sell, armed.sellFrom)) return 'SELL';
    if (!done.has('BUY') && hit(armed.buy, armed.buyFrom)) return 'BUY';
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

/** How many trades one touch of a line can open. */
export const GUARD_COUNTS = [1, 2, 3, 4, 6, 10];

/** The trades one touch of a line opened, watched together. */
export interface GuardGroup {
    uid?: number;
    /** False while the person has switched this group's watching off. */
    active?: boolean;
    side: Side;
    ids: number[];
    /** Close them all when their total profit reaches this (optional). */
    takeProfit: number | null;
    /** Close them all when their total loss reaches this (optional). */
    stopLoss: number | null;
    done: boolean;
}

interface Row {
    id: number;
    profit: number | null;
    result: number | null;
    closed: boolean;
}

/** Total profit of the group: open trades at their live profit, closed ones at their final result. */
export function groupTotal(group: Pick<GuardGroup, 'ids'>, rows: Row[]): number {
    const byId = new Map(rows.map(r => [r.id, r]));
    const sum = group.ids.reduce((t, id) => {
        const r = byId.get(id);
        if (!r) return t;
        return t + (r.closed ? r.result ?? r.profit ?? 0 : r.profit ?? 0);
    }, 0);
    return Math.round(sum * 100) / 100;
}

/** 'tp' when the combined profit reached the target, 'sl' when the combined loss reached the limit. */
export function groupVerdict(group: GuardGroup, rows: Row[]): 'tp' | 'sl' | null {
    if (group.done || group.active === false || !group.ids.length) return null;
    const total = groupTotal(group, rows);
    if (hasLevel(group.takeProfit) && total >= group.takeProfit) return 'tp';
    if (hasLevel(group.stopLoss) && total <= -group.stopLoss) return 'sl';
    return null;
}
