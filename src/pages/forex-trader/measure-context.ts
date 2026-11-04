import { useSyncExternalStore } from 'react';

/**
 * What the chart's Measure tool needs to turn a price distance into money: the stake, multiplier and number of
 * trades the Trade panel is set to. The Forex Live page publishes it; the plain Forex Trader page has none, so
 * the Measure tool there shows only the price distance.
 */
export interface MeasureContext {
    stake: number;
    multiplier: number;
    count: number;
    currency: string;
}

let snapshot: MeasureContext | null = null;
const listeners = new Set<() => void>();

export const setMeasureContext = (next: MeasureContext | null) => {
    const same =
        (next === null && snapshot === null) ||
        (next !== null &&
            snapshot !== null &&
            next.stake === snapshot.stake &&
            next.multiplier === snapshot.multiplier &&
            next.count === snapshot.count &&
            next.currency === snapshot.currency);
    if (same) return;
    snapshot = next;
    listeners.forEach(l => l());
};

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};

export const useMeasureContext = (): MeasureContext | null => useSyncExternalStore(subscribe, () => snapshot);
