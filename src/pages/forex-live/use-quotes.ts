import { useEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';

export interface Quote {
    bid: number | null;
    ask: number | null;
    /** the price a moment ago, to colour the price up or down */
    prev: number | null;
    /** today's first price, high and low (from the daily candle) */
    open: number | null;
    high: number | null;
    low: number | null;
    pip: number;
    at: number;
}

// the list redraws a few times a second; a single market (the SELL / BUY bar) redraws on every tick it gets
const LIST_FLUSH_MS = 150;

/**
 * Live buy and sell prices for a few markets, like the Quotes list of a trading app.
 * Each market is one live price stream from Deriv; they are all stopped when the list is left.
 * The numbers only come from Deriv's answers: a market that does not answer stays empty (shown as a dash).
 */
export function useQuotes(symbols: string[]): Record<string, Quote> {
    const instant = symbols.length === 1;
    const { ws, isConnected } = useDerivWS();
    const [quotes, setQuotes] = useState<Record<string, Quote>>({});
    const key = symbols.join(',');
    const store = useRef<Record<string, Quote>>({});

    useEffect(() => {
        if (!ws || !isConnected || !symbols.length) return;
        let off = false;
        const stops: Array<() => void> = [];
        const patch = (s: string, p: Partial<Quote>) => {
            const cur = store.current[s] ?? { bid: null, ask: null, prev: null, open: null, high: null, low: null, pip: 5, at: 0 };
            store.current[s] = { ...cur, ...p };
        };
        const timer = instant
            ? 0
            : window.setInterval(() => {
                  if (!off) setQuotes({ ...store.current });
              }, LIST_FLUSH_MS);

        symbols.forEach(s => {
            ws.subscribe({ ticks: s }, data => {
                if (off) return;
                const t = (data as { tick?: { bid?: number; ask?: number; quote?: number; pip_size?: number; epoch?: number } }).tick;
                if (!t) return;
                const cur = store.current[s];
                const bid = Number(t.bid ?? t.quote);
                const ask = Number(t.ask ?? t.quote);
                patch(s, { bid, ask, prev: cur?.bid ?? null, pip: t.pip_size ?? cur?.pip ?? 5, at: (t.epoch ?? 0) * 1000 });
                if (instant) setQuotes({ ...store.current });
            })
                .then(sub => {
                    if (off) sub.unsubscribe();
                    else stops.push(sub.unsubscribe);
                })
                .catch(() => {});

            ws.send<{ candles?: Array<{ open: number; high: number; low: number }> }>({
                ticks_history: s,
                style: 'candles',
                granularity: 86400,
                end: 'latest',
                count: 1,
            })
                .then(res => {
                    const c = res.candles?.[res.candles.length - 1];
                    if (!off && c) patch(s, { open: Number(c.open), high: Number(c.high), low: Number(c.low) });
                })
                .catch(() => {});
        });

        return () => {
            off = true;
            if (timer) window.clearInterval(timer);
            stops.forEach(f => f());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ws, isConnected, key]);

    return quotes;
}
