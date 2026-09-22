import { useState } from 'react';

interface ModeRailProps {
  /** Currently selected trade type — when provided (together with
   * onSelectTradeType), the trade-type grid below is rendered, letting the
   * person switch directly instead of going through a menu. Left undefined
   * on tabs that don't want this (none currently — all three trade-type
   * pages pass both), so this stays fully optional/backwards compatible. */
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
}

/** Same trade-type list as components/trade-controls.tsx's Market contracts
 * menu — duplicated here (rather than imported) to avoid coupling this
 * shared component to that file, matching the existing convention already
 * used for that duplication. Short labels: these render as compact grid
 * buttons now, not a dropdown menu, so there's no room for the longer
 * 'Directional'/'Digit based' prefixes the old menu used. */
const MARKET_CONTRACT_TYPES = [
  { label: 'Accumulators', value: 'accumulators' },
  { label: 'Rise/Fall', value: 'rise-fall' },
  { label: 'Matches/Differs', value: 'matches-differs' },
  { label: 'Over/Under', value: 'over-under' },
  { label: 'Even/Odd', value: 'even-odd' },
];

/**
 * Automated-trading badge + trade-type switcher.
 *
 * Manual trading and the Bot library have been removed app-wide —
 * Automated trading is now the only mode everywhere, so the badge is an
 * always-on status indicator (not a toggle) rather than a button.
 *
 * The trade-type switcher used to be a menu behind a small grid icon; it's
 * now shown directly as a grid of buttons (5 items, 3 columns, wrapping to
 * two rows) so every trade type is visible and reachable in one tap/click
 * instead of hidden behind an extra menu open. Stacked full-width below the
 * badge, not squeezed into a side column next to it — a two-column layout
 * was tried first but left too little width for the grid, causing the
 * labels to crowd/overlap each other.
 *
 * Mobile-only: given a relative position + elevated z-index so it sits
 * above whatever overlay/loading layer is covering it for the first ~2
 * minutes after reload on mobile (same tap-lock issue fixed on the
 * Rise/Fall trade-controls panel). Desktop (lg:) is untouched.
 */
export function ModeRail({ activeTradeType, onSelectTradeType }: ModeRailProps) {
  return (
    <div className="flex flex-col gap-2.5 mb-3 max-lg:relative max-lg:z-[9999]">
      {/* Automated trading — always-on status badge, no longer a toggle
          since Manual mode no longer exists. */}
      <div
        title="Automated trading"
        className="flex items-center gap-1.5 self-start rounded-full pl-2.5 pr-3.5 py-1.5 bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/30"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="5" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="6" cy="9" r="1" fill="currentColor" />
          <circle cx="10" cy="9" r="1" fill="currentColor" />
          <path d="M8 5V2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="1.5" r="0.8" fill="currentColor" />
        </svg>
        <span className="text-[10px] font-semibold tracking-wide">Automated</span>
      </div>

      {/* Trade-type grid: full width, 3 columns, wrapping to two rows (3+2)
          for 5 items. A faint shared background + border groups the whole
          grid visually as one control, with each cell divided by hairlines
          rather than floating loose pills. */}
      {onSelectTradeType && (
        <div
          className="grid grid-cols-3 rounded-lg border border-border/60 bg-foreground/[0.03] overflow-hidden"
          role="tablist"
          aria-label="Trade type"
        >
          {MARKET_CONTRACT_TYPES.map((item, index) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={activeTradeType === item.value}
              onClick={() => onSelectTradeType(item.value)}
              className={`px-2 py-2 text-center text-[11.5px] font-medium leading-tight transition-colors border-border/60 ${
                index % 3 !== 2 ? 'border-r' : ''
              } ${index < 3 ? 'border-b' : ''} ${
                activeTradeType === item.value
                  ? 'bg-gradient-to-b from-indigo-500/20 to-violet-500/10 text-foreground shadow-[inset_0_-2px_0_0] shadow-indigo-500'
                  : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
