
import { useRef, useEffect, useState } from 'react';
import { DigitStatsView } from '@/pages/epm-analysis-tool/digit-stats-widget';
import { useLiveDigitSnapshot } from '@/external/rise-fall-dtrader/lib/live-digit-store';

interface DigitStatsBarProps {
  selectedDigit: number;
  onDigitSelect: (digit: number) => void;
}

/**
 * Last-digit circles for the Dtrader chart.
 *
 * LOOK: exactly the Analysis Tool's circles (same component, same colours,
 * arcs, "current digit" enlargement + red pointer, blue "selected" fill) —
 * laid out in ONE row of ten instead of two rows of five.
 *
 * LIVE: reads Dtrader's per-tick live store (lib/live-digit-store.ts), which is
 * updated on every single tick straight from the websocket — not the page's
 * 150 ms batched state — and only these circles redraw when it changes.
 *
 * Tapping a circle picks that digit (the selected digit is the trade barrier).
 *
 * Self-deduplicating: if multiple instances mount (e.g. old cached component +
 * new one, or parent renders twice), only the FIRST instance stays visible. All
 * subsequent instances detect that one already exists and render nothing. This
 * guarantees exactly one bar on screen regardless of React double-mounts, HMR,
 * or parent re-renders.
 */
export function DigitStatsBar({ selectedDigit, onDigitSelect }: DigitStatsBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(true);
  const { percentages, highest, lowest, lastDigit } = useLiveDigitSnapshot();

  useEffect(() => {
    const t = setTimeout(() => {
      const all = document.querySelectorAll('[data-digit-stats-bar-root]');
      if (all.length > 1 && rootRef.current && all[0] !== rootRef.current) {
        setShouldRender(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!shouldRender) return null;

  /* MOBILE FIX: on desktop (lg and up) the bar still floats over the bottom
     of the chart (absolute, centred, z-50). Below lg it is switched to a normal
     in-flow row that sits directly UNDER the chart inside the same container.
     In-flow content cannot be covered by the chart's own layers (SmartCharts'
     Flutter canvas / glass pane), which is what was hiding the floating
     version on phones. */
  return (
    <div
      ref={rootRef}
      data-digit-stats-bar-root
      className="absolute bottom-6 left-1/2 z-50 w-[min(96%,520px)] -translate-x-1/2 max-lg:static max-lg:w-full max-lg:shrink-0 max-lg:translate-x-0 max-lg:px-2 max-lg:pb-1 max-lg:pt-1"
    >
      <DigitStatsView
        singleRow
        percentages={percentages}
        highest={highest}
        lowest={lowest}
        currentDigit={lastDigit}
        highlightDigits={[selectedDigit]}
        onSelect={onDigitSelect}
      />
    </div>
  );
}
