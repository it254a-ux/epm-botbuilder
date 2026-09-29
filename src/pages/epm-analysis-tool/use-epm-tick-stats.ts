import { useEffect, useRef, useState } from 'react';
import type { DerivWS } from '@deriv/core';
import { getLastDigit, pipSizeFromPip } from '@/external/rise-fall-dtrader/lib/digit-stats';

const HISTORY_TICK_COUNT = 1000;
export const RECENT_TICKS_SHOWN = 40;

export interface EpmTick {
    digit: number;
    quote: number;
    epoch: number;
}

export type EpmConnectionStatus = 'connecting' | 'analyzing' | 'error';

interface UseEpmTickStatsReturn {
    ticks: EpmTick[];
    status: EpmConnectionStatus;
    errorMessage: string | null;
}

/**
 * Live tick + digit-stats feed for one symbol, built on the same DerivWS
 * connection (@deriv/core's useDerivWS) that Dtrader already uses
 * successfully elsewhere in this app -- not a second, separately-opened
 * WebSocket. There's no "connect" step exposed to the caller: as soon as
 * `ws` is connected and a `symbol` is picked, this fetches history and
 * subscribes automatically, and cleans up its subscription on symbol
 * change / unmount.
 */
export function useEpmTickStats(ws: DerivWS | null, isConnected: boolean, symbol: string): UseEpmTickStatsReturn {
    const [ticks, setTicks] = useState<EpmTick[]>([]);
    const [status, setStatus] = useState<EpmConnectionStatus>('connecting');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const pipDecimalsRef = useRef<number>(2);

    useEffect(() => {
        if (!ws || !isConnected || !symbol) return;
        let disposed = false;
        let unsubscribe: (() => void) | null = null;

        setStatus('connecting');
        setErrorMessage(null);
        setTicks([]);

        async function run() {
            try {
                // Resolve the real pip size for this symbol first so the very
                // first batch of historical ticks gets correct last digits
                // (rather than guessing and re-deriving once the first live
                // tick arrives).
                const symbolsRes = await ws!.send<{ active_symbols?: Array<{ underlying_symbol: string; pip_size: number }> }>({
                    active_symbols: 'full',
                });
                if (disposed) return;
                const match = symbolsRes.active_symbols?.find(s => s.underlying_symbol === symbol);
                if (match) pipDecimalsRef.current = pipSizeFromPip(match.pip_size);

                const historyRes = await ws!.send<{ history?: { prices: number[]; times: number[] } }>({
                    ticks_history: symbol,
                    start: 1,
                    count: HISTORY_TICK_COUNT,
                    end: 'latest',
                    style: 'ticks',
                });
                if (disposed) return;

                const prices = historyRes.history?.prices ?? [];
                const times = historyRes.history?.times ?? [];
                const historyTicks: EpmTick[] = prices.map((quote, i) => ({
                    quote,
                    digit: getLastDigit(quote, pipDecimalsRef.current),
                    epoch: times[i] ?? 0,
                }));
                setTicks(historyTicks);

                const sub = await ws!.subscribe({ ticks: symbol }, data => {
                    if (disposed) return;
                    const tick = (data as { tick?: { quote: number; pip_size?: number; epoch: number } }).tick;
                    if (!tick) return;
                    if (tick.pip_size) pipDecimalsRef.current = pipSizeFromPip(tick.pip_size);
                    const digit = getLastDigit(tick.quote, pipDecimalsRef.current);
                    setTicks(prev => {
                        const next = [...prev, { quote: tick.quote, digit, epoch: tick.epoch }];
                        return next.length > HISTORY_TICK_COUNT ? next.slice(-HISTORY_TICK_COUNT) : next;
                    });
                    setStatus('analyzing');
                });
                if (disposed) {
                    sub.unsubscribe();
                    return;
                }
                unsubscribe = sub.unsubscribe;
                setStatus('analyzing');
            } catch (err) {
                if (!disposed) {
                    setStatus('error');
                    setErrorMessage(err instanceof Error ? err.message : 'Connection error');
                }
            }
        }

        run();

        return () => {
            disposed = true;
            if (unsubscribe) unsubscribe();
            if (ws?.isConnected) ws.send({ forget_all: 'ticks' }).catch(() => {});
        };
    }, [ws, isConnected, symbol]);

    return { ticks, status, errorMessage };
}

/** One-shot historical fetch for the backtester -- reuses the same shared
 *  `ws` connection instead of opening a separate WebSocket. */
export async function fetchBacktestDigits(ws: DerivWS, symbol: string, count: number): Promise<number[]> {
    const symbolsRes = await ws.send<{ active_symbols?: Array<{ underlying_symbol: string; pip_size: number }> }>({
        active_symbols: 'full',
    });
    const match = symbolsRes.active_symbols?.find(s => s.underlying_symbol === symbol);
    const decimals = match ? pipSizeFromPip(match.pip_size) : 2;

    const historyRes = await ws.send<{ history?: { prices: number[] } }>({
        ticks_history: symbol,
        start: 1,
        count,
        end: 'latest',
        style: 'ticks',
    });
    const prices = historyRes.history?.prices ?? [];
    return prices.map(p => getLastDigit(p, decimals));
}
