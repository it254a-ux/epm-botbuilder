
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DerivWS, ActiveSymbol } from '@deriv/core';
import { getLastDigit, pipSizeFromPip } from '@/external/rise-fall-dtrader/lib/digit-stats';
import { TRICKER_ROTATION_SYMBOLS } from './use-digit-tricker-automation';

/** How many recent ticks to keep per symbol for the repeat-rate calculation. */
const WINDOW_SIZE = 300;
/** Minimum ticks collected on a symbol before it's considered for ranking at all. */
const MIN_HISTORY = 20;
/** Minimum times the target digit itself must have appeared before trusting the rate. */
const MIN_DIGIT_SAMPLES = 5;

interface UseTrickerBackgroundScannerParams {
  ws: DerivWS | null;
  isConnected: boolean;
  /** Only subscribes while true — scoped to Tricker's own run, not the whole page. */
  enabled: boolean;
  /** Used to resolve each rotation symbol's real pip size for correct last-digit extraction. */
  symbols?: ActiveSymbol[];
}

export interface UseTrickerBackgroundScannerReturn {
  /**
   * Given a target digit, returns whichever rotation symbol currently has
   * the LOWEST observed rate of that digit repeating on the very next
   * tick (best odds for a Differ bet), among symbols with enough
   * background data collected so far. Returns null if no symbol yet has
   * enough data for a fair comparison — callers should fall back to a
   * simple step in that case rather than block on it.
   */
  getBestDifferSymbol: (targetDigit: number) => string | null;
  /** Ticks collected so far per symbol — for optional status display only. */
  sampleCounts: Record<string, number>;
}

export function useTrickerBackgroundScanner({
  ws,
  isConnected,
  enabled,
  symbols,
}: UseTrickerBackgroundScannerParams): UseTrickerBackgroundScannerReturn {
  // Rolling per-symbol digit history lives in refs, not state — this
  // updates many times a second across up to 8 concurrent streams, and
  // routing that through React state would cause excessive re-renders.
  // sampleCounts (state) is a throttled snapshot for display only; the
  // ranking function always reads the live refs directly.
  const digitHistoryRef = useRef<Record<string, number[]>>({});
  const pipDecimalsRef = useRef<Record<string, number>>({});
  const [sampleCounts, setSampleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || !ws || !isConnected) return;
    let disposed = false;
    const unsubscribes: (() => void)[] = [];

    TRICKER_ROTATION_SYMBOLS.forEach((symbol) => {
      const meta = symbols?.find((s) => s.underlying_symbol === symbol);
      // Skip symbols not confirmed available on this account — same
      // availability guard used by the automation hook's start().
      if (symbols && symbols.length > 0 && !meta) return;

      pipDecimalsRef.current[symbol] = pipSizeFromPip(meta?.pip_size ?? 0.01);
      digitHistoryRef.current[symbol] = digitHistoryRef.current[symbol] ?? [];

      ws
        .subscribe({ ticks: symbol }, (data) => {
          if (disposed) return;
          const tick = (data as { tick?: { quote: number; pip_size?: number } }).tick;
          if (!tick) return;
          const decimals = tick.pip_size !== undefined ? pipSizeFromPip(tick.pip_size) : pipDecimalsRef.current[symbol];
          const digit = getLastDigit(tick.quote, decimals);
          const history = digitHistoryRef.current[symbol];
          history.push(digit);
          if (history.length > WINDOW_SIZE) history.shift();
        })
        .then(({ unsubscribe }) => {
          if (disposed) {
            unsubscribe();
            return;
          }
          unsubscribes.push(unsubscribe);
        })
        .catch(() => {});
    });

    // Throttled readout for the UI only — the ranking function itself
    // never reads this, it reads the live refs directly.
    const interval = setInterval(() => {
      if (disposed) return;
      const counts: Record<string, number> = {};
      for (const symbol of TRICKER_ROTATION_SYMBOLS) {
        counts[symbol] = digitHistoryRef.current[symbol]?.length ?? 0;
      }
      setSampleCounts(counts);
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(interval);
      unsubscribes.forEach((u) => u());
      digitHistoryRef.current = {};
    };
  }, [enabled, ws, isConnected, symbols]);

  const getBestDifferSymbol = useCallback((targetDigit: number): string | null => {
    let best: string | null = null;
    let bestRate = Infinity;

    for (const symbol of TRICKER_ROTATION_SYMBOLS) {
      const history = digitHistoryRef.current[symbol];
      if (!history || history.length < MIN_HISTORY) continue;

      let appearances = 0;
      let repeats = 0;
      for (let i = 0; i < history.length - 1; i++) {
        if (history[i] === targetDigit) {
          appearances++;
          if (history[i + 1] === targetDigit) repeats++;
        }
      }
      if (appearances < MIN_DIGIT_SAMPLES) continue;

      const rate = repeats / appearances;
      if (rate < bestRate) {
        bestRate = rate;
        best = symbol;
      }
    }

    return best;
  }, []);

  return { getBestDifferSymbol, sampleCounts };
}
