
import { useMemo, useState } from 'react';
import type { ActiveSymbol } from '@/external/deriv-core';

export interface MarketBrowserModalProps {
  open: boolean;
  onClose: () => void;
  symbols: ActiveSymbol[];
  isLoading?: boolean;
  onSelectSymbol: (symbol: string, displayName: string) => void;
}

interface SubmarketGroup {
  name: string;
  symbols: ActiveSymbol[];
}

interface MarketGroup {
  name: string;
  submarkets: SubmarketGroup[];
}

function buildGroups(symbols: ActiveSymbol[], query: string): MarketGroup[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? symbols.filter((s) => {
        const name = (s.underlying_symbol_name ?? s.underlying_symbol ?? '').toLowerCase();
        const code = (s.underlying_symbol ?? '').toLowerCase();
        return name.includes(q) || code.includes(q);
      })
    : symbols;

  const marketMap = new Map<string, Map<string, ActiveSymbol[]>>();

  for (const s of filtered) {
    const marketName = s.market_display_name ?? s.market ?? 'Other';
    const submarketName = s.submarket_display_name ?? s.submarket ?? 'Other';

    if (!marketMap.has(marketName)) marketMap.set(marketName, new Map());
    const submarketMap = marketMap.get(marketName)!;

    if (!submarketMap.has(submarketName)) submarketMap.set(submarketName, []);
    submarketMap.get(submarketName)!.push(s);
  }

  return Array.from(marketMap.entries()).map(([name, submarketMap]) => ({
    name,
    submarkets: Array.from(submarketMap.entries()).map(([subName, syms]) => ({
      name: subName,
      symbols: syms,
    })),
  }));
}

/** Small dot showing whether a market is currently open for trading. */
function MarketStatusDot({ isOpen }: { isOpen: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
      aria-label={isOpen ? 'Market open' : 'Market closed'}
    />
  );
}

export function MarketBrowserModal({ open, onClose, symbols, isLoading, onSelectSymbol }: MarketBrowserModalProps) {
  const [query, setQuery] = useState('');
  // Which market sections are expanded. Defaults to the first market open
  // so the panel isn't a big wall of collapsed rows on first open.
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  const groups = useMemo(() => buildGroups(symbols, query), [symbols, query]);

  if (!open) return null;

  const toggleMarket = (name: string) => {
    setExpandedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSelect = (s: ActiveSymbol) => {
    onSelectSymbol(s.underlying_symbol, s.underlying_symbol_name ?? s.underlying_symbol);
    onClose();
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-16 pb-8" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[75vh] flex flex-col rounded-lg border border-border/50 dark:border-white/[0.08] bg-background shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/50 dark:border-white/[0.08] px-3 py-2.5">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading markets…</div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No markets match &quot;{query}&quot;</div>
          ) : (
            groups.map((market) => {
              // Auto-expand every market while searching, so results aren't hidden behind a collapsed header.
              const isExpanded = query.trim() !== '' || expandedMarkets.has(market.name);
              return (
                <div key={market.name} className="border-b border-border/30 dark:border-white/[0.04] last:border-b-0">
                  <button
                    onClick={() => toggleMarket(market.name)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-foreground/5"
                  >
                    <span>{market.name}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isExpanded &&
                    market.submarkets.map((submarket) => (
                      <div key={submarket.name} className="pb-1">
                        <div className="px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {submarket.name}
                        </div>
                        {submarket.symbols.map((s) => (
                          <button
                            key={s.underlying_symbol}
                            onClick={() => handleSelect(s)}
                            className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-foreground/5"
                          >
                            <MarketStatusDot isOpen={!!s.exchange_is_open} />
                            <span className="truncate">{s.underlying_symbol_name ?? s.underlying_symbol}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
