
import { useState, useMemo, useCallback } from 'react';
import { useBuy } from '@/external/rise-fall-dtrader/hooks/use-buy';
import type {
  ActiveSymbol,
  Tick,
  BuyResult,
} from '@/external/deriv-core';
import type { ApiWsHandle as DerivWS } from '@/external/rise-fall-dtrader/lib/api-ws-adapter';
import { useBaseTrading } from '@/external/rise-fall-dtrader/hooks/use-base-trading';
import type { UseBaseTradingParams } from '@/external/rise-fall-dtrader/hooks/use-base-trading';
import { useAccumulatorProposal } from './use-accumulator-proposal';
import type { AccumulatorProposalInfo, AccumulatorProposalParams } from './use-accumulator-proposal';
import type { AccumulatorContractInfo, GrowthRate } from '@/external/rise-fall-dtrader/lib/accumulator-types';
import type { OpenPosition, ClosedPosition } from '@/external/rise-fall-dtrader/lib/types';

const CONTRACT_TYPES = ['ACCU'];

const GROWTH_RATE_LABELS: Record<number, string> = {
  0.01: '1%',
  0.02: '2%',
  0.03: '3%',
  0.04: '4%',
  0.05: '5%',
};

interface UseAccumulatorTradingReturn {
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  prices: number[];
  pipSize: number;
  growthRate: GrowthRate;
  setGrowthRate: (rate: GrowthRate) => void;
  growthRateOptions: { value: number; label: string }[];
  stake: string;
  setStake: (value: string) => void;
  takeProfit: string;
  setTakeProfit: (value: string) => void;
  proposal: AccumulatorProposalInfo | null;
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

export type UseAccumulatorTradingParams = Pick<UseBaseTradingParams, 'ws' | 'isConnected' | 'isExhausted' | 'isAuthenticated' | 'onAuthWSFailed' | 'enabled'>;

export function useAccumulatorTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, enabled }: UseAccumulatorTradingParams): UseAccumulatorTradingReturn {
  const {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    contracts,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  } = useBaseTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, contractTypes: CONTRACT_TYPES, enabled });

  const [growthRate, setGrowthRate] = useState<GrowthRate>(0.01);
  const [stake, setStake] = useState<string>('1.5');
  const [takeProfit, setTakeProfit] = useState<string>('');

  const growthRateOptions = useMemo(() => {
    const accuContract = (contracts as unknown as AccumulatorContractInfo[]).find(
      (c) => c.contract_type === 'ACCU'
    );
    if (accuContract?.growth_rate_range?.length) {
      return accuContract.growth_rate_range.map((rate) => ({
        value: rate,
        label: GROWTH_RATE_LABELS[rate] ?? `${(rate * 100).toFixed(0)}%`,
      }));
    }
    return [0.01, 0.02, 0.03, 0.04, 0.05].map((rate) => ({
      value: rate,
      label: GROWTH_RATE_LABELS[rate] ?? `${(rate * 100).toFixed(0)}%`,
    }));
  }, [contracts]);

  const { buyContract: buyWithProposal, isBuying, buyResult, buyError, clearBuyResult } =
    useBuy(tradingWs, tradingIsConnected);

  const proposalParams: AccumulatorProposalParams | null = useMemo(() => {
    if (isBuying || !activeSymbol) return null;
    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum <= 0) return null;

    const params: AccumulatorProposalParams = {
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      growthRate,
      currency: 'USD',
    };

    const tp = parseFloat(takeProfit);
    if (tp && tp > 0) {
      params.takeProfit = tp;
    }

    return params;
  }, [activeSymbol, stake, growthRate, takeProfit, isBuying]);

  const { proposal } = useAccumulatorProposal(tradingWs, tradingIsConnected, proposalParams);

  const buyContract = useCallback(async () => {
    if (proposal) await buyWithProposal(proposal);
  }, [proposal, buyWithProposal]);

  return {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    growthRate,
    setGrowthRate,
    growthRateOptions,
    stake,
    setStake,
    takeProfit,
    setTakeProfit,
    proposal,
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
