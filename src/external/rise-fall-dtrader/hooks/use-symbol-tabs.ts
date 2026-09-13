
import { useCallback, useState } from 'react';

export interface OpenSymbolTab {
  /** Stable key: `${tradeType}:${symbol}`. A given symbol can be open under more than one trade type at once (each is its own tab). */
  id: string;
  tradeType: string;
  symbol: string;
  displayName: string;
}

interface UseSymbolTabsParams {
  initialTradeType: string;
  initialSymbol: string;
  initialDisplayName: string;
  /** Called whenever the active tab changes (tab click, new tab opened, or a tab closed while it was active) so the page can switch its active trade-type/symbol to match. */
  onActivate: (tab: { tradeType: string; symbol: string }) => void;
}

interface UseSymbolTabsReturn {
  tabs: OpenSymbolTab[];
  activeTabId: string;
  /** Opens (or, if already open, just switches to) a tab for this trade type + symbol. */
  openTab: (tradeType: string, symbol: string, displayName: string) => void;
  /** Closes a tab. Refuses to close the last remaining tab, same as Deriv — there must always be at least one open. */
  closeTab: (id: string) => void;
  selectTab: (id: string) => void;
  /**
   * Updates the display name of the tab matching this trade type + symbol,
   * if one is open. Used once real active_symbols data resolves the
   * human-readable name for a tab that was opened optimistically.
   */
  renameTab: (tradeType: string, symbol: string, displayName: string) => void;
}

export function useSymbolTabs({
  initialTradeType,
  initialSymbol,
  initialDisplayName,
  onActivate,
}: UseSymbolTabsParams): UseSymbolTabsReturn {
  const initialId = `${initialTradeType}:${initialSymbol}`;
  const [tabs, setTabs] = useState<OpenSymbolTab[]>([
    { id: initialId, tradeType: initialTradeType, symbol: initialSymbol, displayName: initialDisplayName },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(initialId);

  const openTab = useCallback(
    (tradeType: string, symbol: string, displayName: string) => {
      const id = `${tradeType}:${symbol}`;
      const existing = tabs.find((t) => t.id === id);
      if (!existing) {
        setTabs([...tabs, { id, tradeType, symbol, displayName }]);
      }
      setActiveTabId(id);
      onActivate({ tradeType, symbol });
    },
    [tabs, onActivate]
  );

  const closeTab = useCallback(
    (id: string) => {
      if (tabs.length <= 1) return; // always keep at least one tab open
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const next = tabs.filter((t) => t.id !== id);
      setTabs(next);
      if (id === activeTabId) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        setActiveTabId(fallback.id);
        onActivate({ tradeType: fallback.tradeType, symbol: fallback.symbol });
      }
    },
    [tabs, activeTabId, onActivate]
  );

  const selectTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      setActiveTabId(id);
      onActivate({ tradeType: tab.tradeType, symbol: tab.symbol });
    },
    [tabs, onActivate]
  );

  const renameTab = useCallback((tradeType: string, symbol: string, displayName: string) => {
    const id = `${tradeType}:${symbol}`;
    setTabs((prev) => prev.map((t) => (t.id === id && t.displayName !== displayName ? { ...t, displayName } : t)));
  }, []);

  return { tabs, activeTabId, openTab, closeTab, selectTab, renameTab };
}
