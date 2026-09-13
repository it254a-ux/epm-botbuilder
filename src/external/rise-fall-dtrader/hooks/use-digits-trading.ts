
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useProposal } from '@/external/rise-fall-dtrader/hooks/use-proposal';
import { useBuy } from '@/external/rise-fall-dtrader/hooks/use-buy';
import type {
  ActiveSymbol,
  Tick,
  ProposalInfo,
  ProposalParams,
  DurationLimits,
  BuyResult,
} from '@/external/deriv-core';
import { useBaseTrading } from '@/external/rise-fall-dtrader/hooks/use-base-trading';
import type { UseBaseTradingParams } from '@/external/rise-fall-dtrader/hooks/use-base-trading';
import { computeDigitStats, getLastDigit } from '@/external/rise-fall-dtrader/lib/digit-stats';
import type { ContractMode, TradeType, DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';
import type { OpenPosition, ClosedPosition } from '../lib/types';

const CONTRACT_TYPES = ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'];
const MAX_PRICES = 1000;
const TICK_FLUSH_MS = 150; // Batch rapid ticks to avoid blocking the UI thread on mobile

interface UseDigitsTradingReturn {
  ws: ReturnType<typeof useBaseTrading>['ws'];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  lastDigit: number | null;
  digitStats: DigitStats;
  prices: number[];
  tradeType: TradeType;
  setTradeType: (type: TradeType) => void;
  contractMode: ContractMode;
  setContractMode: (mode: ContractMode) => void;
  selectedDigit: number;
  setSelectedDigit: (digit: number) => void;
  contractsAvailable: boolean;
  pipSize: number;
  stake: string;
  setStake: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  durationLimits: DurationLimits;
  defaultStake: number;
  proposal: ProposalInfo | null;
  isProposalLoading: boolean;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
}

export type UseDigitsTradingParams = Pick<UseBaseTradingParams, 'ws' | 'isConnected' | 'isExhausted' | 'isAuthenticated' | 'onAuthWSFailed' | 'enabled'>;

export function useDigitsTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, enabled }: UseDigitsTradingParams): UseDigitsTradingReturn {
  const {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    prices: basePrices,
    pipSize,
    contractsAvailable,
    durationLimits,
    defaultStake,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  } = useBaseTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, contractTypes: CONTRACT_TYPES, enabled });

  const [tradeType, setTradeTypeRaw] = useState<TradeType>('matches-differs');
  const [contractMode, setContractMode] = useState<ContractMode>('DIGITMATCH');
  const [selectedDigit, setSelectedDigit] = useState<number>(5);
  // Default stake — still fully editable by the user before or during setup.
  const [stake, setStake] = useState<string>('1.5');
  const [duration, setDuration] = useState<number>(5);

  const setTradeType = useCallback((type: TradeType) => {
    setTradeTypeRaw(type);
    switch (type) {
      case 'matches-differs':
        setContractMode('DIGITMATCH');
        break;
      case 'over-under':
        setContractMode('DIGITOVER');
        break;
      case 'even-odd':
        setContractMode('DIGITEVEN');
        break;
    }
  }, []);

  const [ownPrices, setOwnPrices] = useState<number[]>([]);
  const [ownCurrentTick, setOwnCurrentTick] = useState<Tick | null>(null);
  const historySeededRef = useRef(false);

  useEffect(() => {
    if (!historySeededRef.current && basePrices.length > 0) {
      historySeededRef.current = true;
      setOwnPrices(basePrices.slice(-MAX_PRICES));
    }
  }, [basePrices]);

  const activeSymbolKey = activeSymbol?.underlying_symbol ?? null;
  useEffect(() => {
    historySeededRef.current = false;
    setOwnPrices([]);
    setOwnCurrentTick(null);
  }, [activeSymbolKey]);

  // ── Throttled tick buffer ────────────────────────────────────────────────
  // MOBILE FIX: instead of calling setState on EVERY tick (which re-renders
  // the entire page, all 5 automation hooks, and recomputes digit stats
  // 3-5×/sec), we batch ticks in a ref and flush to React state at most
  // every 150 ms. This cuts main-thread work by ~80 % on fast symbols while
  // keeping the UI responsive enough for trading.
  const tickBufferRef = useRef<number[]>([]);
  const lastTickRef = useRef<Tick | null>(null);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tradingWs || !tradingIsConnected || !activeSymbol) return;
    const symbol = activeSymbol.underlying_symbol;

    const flush = () => {
      flushTimeoutRef.current = null;
      const prices = tickBufferRef.current;
      const lastTick = lastTickRef.current;
      if (prices.length === 0 && !lastTick) return;

      if (lastTick) {
        setOwnCurrentTick(lastTick);
      }
      if (prices.length > 0) {
        setOwnPrices(prev => {
          const nextLen = prev.length + prices.length;
          if (nextLen <= MAX_PRICES) {
            return prev.concat(prices);
          }
          // Keep only the last MAX_PRICES — single concat + single slice
          return prev.concat(prices).slice(nextLen - MAX_PRICES);
        });
      }
      tickBufferRef.current = [];
      lastTickRef.current = null;
    };

    const unsubscribe = tradingWs.onMessage((data: Record<string, unknown>) => {
      if (data.msg_type !== 'tick') return;
      const raw = data.tick as Record<string, unknown> | undefined;
      if (
        !raw ||
        typeof raw.symbol !== 'string' ||
        typeof raw.quote !== 'number' ||
        !isFinite(raw.quote) ||
        raw.symbol !== symbol
      ) return;

      const quote: number = raw.quote;
      const newTick: Tick = { quote, epoch: raw.epoch as number } as unknown as Tick;

      lastTickRef.current = newTick;
      tickBufferRef.current.push(quote);

      // Flush immediately if buffer is getting large, otherwise schedule
      if (tickBufferRef.current.length >= 20) {
        if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = setTimeout(flush, 0);
      } else if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(flush, TICK_FLUSH_MS);
      }
    });

    return () => {
      unsubscribe?.();
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      // Drop pending ticks on unmount / symbol change — don't flush stale data
      tickBufferRef.current = [];
      lastTickRef.current = null;
    };
  }, [tradingWs, tradingIsConnected, activeSymbol]);

  const digitStats: DigitStats = useMemo(
    () => computeDigitStats(ownPrices, pipSize),
    [ownPrices, pipSize]
  );

  const lastDigit = useMemo(() => {
    if (ownCurrentTick != null) return getLastDigit(ownCurrentTick.quote, pipSize);
    if (ownPrices.length > 0) return getLastDigit(ownPrices[ownPrices.length - 1], pipSize);
    return null;
  }, [ownCurrentTick, ownPrices, pipSize]);

  const {
    buyContract: buyWithProposal,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
  } = useBuy(tradingWs, tradingIsConnected);

  const proposalParams: ProposalParams | null = useMemo(() => {
    if (isBuying || !activeSymbol) return null;
    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum <= 0) return null;
    const needsBarrier = contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';
    return {
      contractType: contractMode,
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      duration,
      durationUnit: 't',
      basis: 'stake' as const,
      currency: 'USD',
      ...(needsBarrier ? { barrier: selectedDigit } : {}),
    };
  }, [activeSymbol, contractMode, stake, duration, selectedDigit, isBuying]);

  const { proposal } = useProposal(tradingWs, tradingIsConnected, proposalParams);

  const buyContract = useCallback(async () => {
    if (proposal) {
      await buyWithProposal(proposal);
    }
  }, [proposal, buyWithProposal]);

  return {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick: ownCurrentTick,
    lastDigit,
    digitStats,
    prices: ownPrices,
    pipSize,
    tradeType,
    setTradeType,
    contractMode,
    setContractMode,
    selectedDigit,
    setSelectedDigit,
    contractsAvailable,
    stake,
    setStake,
    duration,
    setDuration,
    durationLimits,
    defaultStake,
    proposal,
    isProposalLoading: tradingIsConnected && proposalParams !== null && proposal === null,
    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  };
}
