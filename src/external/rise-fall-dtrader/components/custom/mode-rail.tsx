import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/external/rise-fall-dtrader/components/ui/popover';

interface ModeRailProps {
  /** Currently selected trade type — when provided (together with
   * onSelectTradeType), a "Market contracts" icon is rendered in this row
   * that opens an upward menu of trade types, same list as the one on the
   * Rise/Fall panel. Left undefined on tabs that don't want this button
   * (e.g. Rise/Fall itself, which already has its own Market contracts
   * trigger elsewhere), so this stays fully optional/backwards compatible. */
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
}

/** Same trade-type list as components/trade-controls.tsx's Market contracts
 * menu — duplicated here (rather than imported) to avoid coupling this
 * shared component to that file, matching the existing convention already
 * used for that duplication. */
const MARKET_CONTRACT_TYPES = [
  { label: 'Accumulators', value: 'accumulators' },
  { label: 'Directional Rise/Fall', value: 'rise-fall' },
  { label: 'Digit based Matches/Differs', value: 'matches-differs' },
  { label: 'Over/Under', value: 'over-under' },
  { label: 'Even/Odd', value: 'even-odd' },
];

/**
 * Automated-trading badge + Market-contracts ("view") icon row.
 *
 * Manual trading and the Bot library have been removed app-wide —
 * Automated trading is now the only mode everywhere, so the first icon is
 * an always-on status badge (not a toggle) rather than a button, and the
 * old Manual + Bot-library buttons are gone entirely. Given a colorful,
 * intentional treatment instead of flat black/white boxes.
 *
 * Mobile-only: given a relative position + elevated z-index so it sits
 * above whatever overlay/loading layer is covering it for the first ~2
 * minutes after reload on mobile (same tap-lock issue fixed on the
 * Rise/Fall trade-controls panel). Desktop (lg:) is untouched.
 */
export function ModeRail({ activeTradeType, onSelectTradeType }: ModeRailProps) {
  const [isMarketMenuOpen, setIsMarketMenuOpen] = useState(false);

  return (
    <div className="flex flex-row items-center gap-2 mb-2 max-lg:relative max-lg:z-[9999]">
      {/* Automated trading — always-on status badge, no longer a toggle
          since Manual mode no longer exists. */}
      <div
        title="Automated trading"
        className="flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1.5 bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/30"
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

      {onSelectTradeType && (
        <Popover open={isMarketMenuOpen} onOpenChange={setIsMarketMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Market contracts"
              className="rounded-full p-2 bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30 transition-transform hover:scale-105 active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-56 p-1 z-[10050]">
            {MARKET_CONTRACT_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onSelectTradeType(item.value);
                  setIsMarketMenuOpen(false);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                  activeTradeType === item.value
                    ? 'bg-gradient-to-r from-indigo-500/15 to-violet-500/15 text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
