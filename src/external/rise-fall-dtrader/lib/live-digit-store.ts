import { useSyncExternalStore } from 'react';
import { getLastDigit } from '@/external/rise-fall-dtrader/lib/digit-stats';

/**
 * Per-tick live feed for the Dtrader digit circles.
 *
 * Why this exists: use-digits-trading batches incoming ticks into React state
 * every 150 ms so the heavy parts of the page (the five automation hooks, the
 * panels) don't re-render several times a second on a phone. That is the right
 * trade-off for them, but it made the digit circles lag behind the real ticks.
 *
 * This store sits beside that batching and is updated on EVERY tick, straight
 * from the websocket handler, with no React state involved. Only the circles
 * subscribe to it (see useLiveDigitSnapshot), so only they redraw per tick --
 * the rest of the page keeps its throttled behaviour untouched. Counts are
 * kept incrementally (add the new digit, drop the oldest), so a tick costs a
 * handful of operations no matter how long the history is.
 */

const MAX_PRICES = 1000;

export interface LiveDigitSnapshot {
  /** Share of ticks (0-100) for each digit 0-9. */
  percentages: number[];
  /** Digit with the biggest share, or -1 when there is no data yet. */
  highest: number;
  /** Digit with the smallest share, or -1 when there is no data yet. */
  lowest: number;
  /** Last digit of the latest tick, or -1 when there is no data yet. */
  lastDigit: number;
  /** Number of ticks currently counted. */
  total: number;
}

const EMPTY_SNAPSHOT: LiveDigitSnapshot = {
  percentages: new Array(10).fill(0),
  highest: -1,
  lowest: -1,
  lastDigit: -1,
  total: 0,
};

function createLiveDigitStore() {
  let prices: number[] = [];
  let counts: number[] = new Array(10).fill(0);
  let pipSize = 2;
  let snapshot: LiveDigitSnapshot = EMPTY_SNAPSHOT;
  const listeners = new Set<() => void>();

  const rebuildCounts = () => {
    counts = new Array(10).fill(0);
    for (const p of prices) counts[getLastDigit(p, pipSize)]++;
  };

  const buildSnapshot = () => {
    const total = prices.length;
    if (total === 0) {
      snapshot = EMPTY_SNAPSHOT;
    } else {
      const percentages = counts.map((c) => (c / total) * 100);
      snapshot = {
        percentages,
        highest: percentages.indexOf(Math.max(...percentages)),
        lowest: percentages.indexOf(Math.min(...percentages)),
        lastDigit: getLastDigit(prices[total - 1], pipSize),
        total,
      };
    }
    listeners.forEach((l) => l());
  };

  return {
    /** Called for every live tick. */
    push(quote: number) {
      prices.push(quote);
      counts[getLastDigit(quote, pipSize)]++;
      if (prices.length > MAX_PRICES) {
        const dropped = prices.shift() as number;
        counts[getLastDigit(dropped, pipSize)]--;
      }
      buildSnapshot();
    },
    /** Replace everything with a fresh history (e.g. after picking a symbol). */
    reset(history: number[]) {
      prices = history.slice(-MAX_PRICES);
      rebuildCounts();
      buildSnapshot();
    },
    clear() {
      prices = [];
      counts = new Array(10).fill(0);
      buildSnapshot();
    },
    /** The symbol's decimal places; re-derives every digit when it changes. */
    setPipSize(next: number) {
      if (next === pipSize) return;
      pipSize = next;
      rebuildCounts();
      buildSnapshot();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

/** One shared instance: there is only ever one Dtrader digits feed on screen. */
export const liveDigitStore = createLiveDigitStore();

/** Re-renders the caller on every tick. Use only in the small circles component. */
export function useLiveDigitSnapshot(): LiveDigitSnapshot {
  return useSyncExternalStore(liveDigitStore.subscribe, liveDigitStore.getSnapshot, liveDigitStore.getSnapshot);
}
