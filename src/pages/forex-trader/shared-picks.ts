import { useCallback, useEffect, useState } from 'react';

/**
 * What the person picked in the Forex Trader tool (market, mode, candle size, strategy). The Forex Trader page
 * and the Forex Live page both show the tool, and this keeps their picks the same: change one and the other follows.
 * The picks are also remembered in the browser, so they are still there after a reload.
 */
export type TPicks = {
    symbol: string;
    mode: 'h1' | 'mtf';
    tf: number;
    category: string;
    strategyId: number;
};

const STORAGE_KEY = 'epm-forex-picks';

const load = (): Partial<TPicks> => {
    try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
        return {};
    }
};

let picks: Partial<TPicks> = load();
const listeners = new Set<() => void>();

/** Like useState, but when `shared` is true the value is the same on every page that shares it. */
export function useSharedPick<K extends keyof TPicks>(
    key: K,
    fallback: TPicks[K],
    shared: boolean
): [TPicks[K], (value: TPicks[K]) => void] {
    const [value, setValue] = useState<TPicks[K]>(() => ((shared ? picks[key] : undefined) ?? fallback) as TPicks[K]);

    useEffect(() => {
        if (!shared) return undefined;
        const onChange = () => {
            const v = picks[key];
            if (v !== undefined) setValue(v as TPicks[K]);
        };
        listeners.add(onChange);
        return () => {
            listeners.delete(onChange);
        };
    }, [key, shared]);

    const set = useCallback(
        (v: TPicks[K]) => {
            setValue(v);
            if (!shared) return;
            picks = { ...picks, [key]: v };
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
            } catch {
                /* private mode: the picks still follow between the pages, they are just not remembered */
            }
            listeners.forEach(l => l());
        },
        [key, shared]
    );

    return [value, set];
}
