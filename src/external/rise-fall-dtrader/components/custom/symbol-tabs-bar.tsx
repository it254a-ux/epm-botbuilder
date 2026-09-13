
import type { OpenSymbolTab } from '@/external/rise-fall-dtrader/hooks/use-symbol-tabs';

const TRADE_TYPE_LABELS: Record<string, string> = {
  accumulators: 'Accumulators',
  'rise-fall': 'Rise/Fall',
  'matches-differs': 'Matches/Differs',
  'over-under': 'Over/Under',
  'even-odd': 'Even/Odd',
};

export interface SymbolTabsBarProps {
  tabs: OpenSymbolTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddClick: () => void;
}

/** Small generic candlestick-style glyph — avoids pulling in an icon library just for this. */
function ChartGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="3" y1="2" x2="3" y2="14" />
      <line x1="8" y1="4" x2="8" y2="12" />
      <line x1="13" y1="1" x2="13" y2="9" />
      <rect x="1.5" y="6" width="3" height="4" fill="currentColor" stroke="none" />
      <rect x="6.5" y="7" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="11.5" y="3" width="3" height="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SymbolTabsBar({ tabs, activeTabId, onSelectTab, onCloseTab, onAddClick }: SymbolTabsBarProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      <button
        onClick={onAddClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/50 dark:border-white/[0.08] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        aria-label="Add chart"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors
              ${isActive
                ? 'border-border/50 dark:border-white/[0.08] bg-foreground/5'
                : 'border-transparent hover:bg-foreground/5'
              }`}
          >
            <ChartGlyph />
            <div className="flex flex-col leading-tight">
              <span className="whitespace-nowrap text-xs font-semibold">{tab.displayName}</span>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {TRADE_TYPE_LABELS[tab.tradeType] ?? tab.tradeType}
              </span>
            </div>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                aria-label={`Close ${tab.displayName}`}
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
