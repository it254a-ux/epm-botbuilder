import { useSyncExternalStore } from 'react';

/**
 * What the open Forex Live trades are worth right now, shared with the header so the balance can move with them.
 * `value` is each open trade's stake plus its live profit (Deriv takes the stake out of the balance when a trade
 * opens and pays stake + profit back when it closes, so balance + value is what the account is worth right now).
 */
export interface LiveEquity {
    loginid: string;
    currency: string;
    count: number;
    value: number;
    profit: number;
}

let snapshot: LiveEquity | null = null;
const listeners = new Set<() => void>();

export const setLiveEquity = (next: LiveEquity | null) => {
    const same =
        (next === null && snapshot === null) ||
        (next !== null &&
            snapshot !== null &&
            next.loginid === snapshot.loginid &&
            next.currency === snapshot.currency &&
            next.count === snapshot.count &&
            next.value === snapshot.value &&
            next.profit === snapshot.profit);
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

export const useLiveEquity = (): LiveEquity | null => useSyncExternalStore(subscribe, () => snapshot);
