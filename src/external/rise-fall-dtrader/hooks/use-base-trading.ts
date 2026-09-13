
import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useActiveSymbols } from '@/external/rise-fall-dtrader/hooks/use-active-symbols';
import { useTicks } from '@/external/rise-fall-dtrader/hooks/use-ticks';
import type { ActiveSymbol, Tick, DurationLimits, ContractInfo } from '@/external/deriv-core';
import type { ApiWsHandle as DerivWS } from '@/external/rise-fall-dtrader/lib/api-ws-adapter';
import { useOpenPositions, type OpenPosition } from './use-open-positions';
import { useClosedPositions, type ClosedPosition } from './use-closed-positions';
import { useSellContract } from './use-sell-contract';

export interface UseBaseTradingParams {
  /** Shared WebSocket instance from DerivWSProvider. */
  ws: DerivWS | null;
  isConnected: boolean;
  /** True when the WS has exhausted all reconnect attempts. */
  isExhausted?: boolean;
  /** True when the user is authenticated (wsUrl is set). Used to gate auth-only calls. */
  isAuthenticated: boolean;
  onAuthWSFailed?: () => void;
  /** Contract types used to filter available symbols and duration limits. */
  contractTypes: string[];
  /**
   * When false, this mode's symbol/contract/tick data is not fetched yet.
   * Used so inactive trade-type tabs (e.g. Digits, Accumulators before
   * they've been opened) don't compete with the active tab's requests on
   * first page load. Defaults to true so existing callers are unaffected.
   */
  enabled?: boolean;
}

export interface UseBaseTradingReturn {
  /** Underlying WebSocket instance — pass to useBuy / useProposal in the template. */
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  /** Raw price history — useful for chart rendering and stat computation. */
  prices: number[];
  pipSize: number;
  contracts: ContractInfo[];
  contractsAvailable: boolean;
  durationLimits: DurationLimits;
  defaultStake: number;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  refreshClosedPositions: () => Promise<void>;
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
}

/**
 * Generic trading foundation shared across all template types.
 *
 * Accepts the shared WS instance from DerivWSProvider rather than creating its
 * own, so the connection persists across page navigations.
 */
export function useBaseTrading({
  ws,
  isConnected,
  isExhausted,
  isAuthenticated,
  onAuthWSFailed,
  contractTypes,
  enabled = true,
}: UseBaseTradingParams): UseBaseTradingReturn {
  // When the authenticated WS exhausts all reconnect attempts, fall back to
  // the public WS by triggering logout.
  useEffect(() => {
    if (isExhausted && ws) {
      onAuthWSFailed?.();
    }
  }, [isExhausted, ws, onAuthWSFailed]);

  const {
    symbols,
    activeSymbol,
    selectSymbol,
    contracts,
    contractsAvailable,
    durationLimits,
    defaultStake,
    isLoading: symbolsLoading,
  } = useActiveSymbols(ws, isConnected, contractTypes, enabled);

  const { currentTick, prices, pipSize } = useTicks(ws, isConnected, activeSymbol);

  // ── CRASH FIX: defensive tick cleanup ────────────────────────────────────
  // useTicks from @deriv/core may not always send forget_all when the
  // component unmounts or when the tab is hidden. If tick subscriptions pile
  // up, the Deriv API eventually rejects new requests with "exhausted" errors.
  // This effect sends an explicit forget_all on unmount and when the tab goes
  // hidden, ensuring old subscriptions are cleared before new ones are made.
  useEffect(() => {
    if (!ws || !isConnected || !activeSymbol) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && isConnected) {
        ws.send({ forget_all: 'ticks' }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (isConnected) {
        ws.send({ forget_all: 'ticks' }).catch(() => {});
      }
    };
  }, [ws, isConnected, activeSymbol]);

  // Surface WS-level errors as toasts. Buy and sell errors are handled by
  // their own hooks and are excluded here to avoid double-reporting.
  useEffect(() => {
    if (!ws || !isConnected) return;
    return ws.onMessage(data => {
      if (!data.error) return;
      const msgType = data.msg_type as string | undefined;
      if (msgType === 'buy' || msgType === 'sell') return;
      const err = data.error as Record<string, string>;
      toast.error('Error', {
        description: err.message ?? 'Unexpected error occurred. Please try again.',
      });
    });
  }, [ws, isConnected]);

  const { positions: openPositions } = useOpenPositions(ws, isConnected, isAuthenticated);

  const { positions: closedPositions, refresh: refreshClosedPositions } = useClosedPositions(
    ws,
    isConnected,
    isAuthenticated
  );

  const {
    sellContract: sellContractRaw,
    sellingId,
    sellError,
    clearSellError,
  } = useSellContract(ws, isConnected);

  // Refresh the closed-positions table after each successful sell.
  const sellContract = useCallback(
    async (contractId: number, bidPrice: string) => {
      await sellContractRaw(contractId, bidPrice);
      await refreshClosedPositions();
    },
    [sellContractRaw, refreshClosedPositions]
  );

  return {
    ws,
    isConnected,
    isLoading: !isConnected || symbolsLoading,
    error: null,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    contracts,
    contractsAvailable,
    durationLimits,
    defaultStake,
    openPositions,
    closedPositions,
    refreshClosedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  };
}
