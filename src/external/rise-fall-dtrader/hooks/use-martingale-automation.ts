
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult, OpenPosition } from '../lib/types';

export type StrategyId = 'martingale' | 'dalembert';

export interface StrategyDefinition {
  id: StrategyId;
  label: string;
  description: string;
}

export const STRATEGIES: StrategyDefinition[] = [
  { id: 'martingale', label: 'Martingale', description: 'Double stake after loss' },
  { id: 'dalembert', label: "D'Alembert", description: 'Increase stake by a fixed unit after loss, decrease by the same unit after a win' },
];

export interface MartingaleSettings {
  strategyId: StrategyId;
  /** Starting stake for the first trade of a run, and the floor stake never goes below. */
  baseStake: number;
  /** Martingale only — multiplier applied to the stake after a loss, e.g. 2 = double on loss. */
  multiplier: number;
  /** D'Alembert only — fixed amount added after a loss / subtracted after a win. */
  stakeIncrement: number;
  /** Hard ceiling — if the next required stake would exceed this, the run stops instead of placing it. Null = no cap. */
  maxStake: number | null;
  /** Stop once cumulative profit reaches +this amount. Null = no target. */
  profitThreshold: number | null;
  /** Stop once cumulative profit reaches -this amount. Null = no limit. */
  lossThreshold: number | null;
}

export const DEFAULT_MARTINGALE_SETTINGS: MartingaleSettings = {
  strategyId: 'martingale',
  baseStake: 10,
  multiplier: 2,
  stakeIncrement: 2,
  maxStake: null,
  profitThreshold: 10,
  lossThreshold: 10,
};

/** Computes the next stake after a settled trade, per the selected strategy. */
function computeNextStake(settings: MartingaleSettings, currentStake: number, won: boolean): number {
  if (settings.strategyId === 'martingale') {
    return won ? settings.baseStake : currentStake * settings.multiplier;
  }
  // D'Alembert: step down by the fixed increment on a win (never below baseStake),
  // step up by the same increment on a loss.
  return won
    ? Math.max(settings.baseStake, currentStake - settings.stakeIncrement)
    : currentStake + settings.stakeIncrement;
}

interface UseMartingaleAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  stake: string;
  setStake: (value: string) => void;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
}

export interface UseMartingaleAutomationReturn {
  settings: MartingaleSettings;
  setSettings: (settings: MartingaleSettings) => void;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  netProfit: number;
  tradeCount: number;
  currentStake: number;
  /** Set when a run ends on its own — profit/loss threshold hit, max stake exceeded, or a buy failed. Null while idle or running. */
  stopReason: string | null;
}

/**
 * Runs an automated strategy (Martingale or D'Alembert) on top of the
 * existing manual trade primitives (proposal/buyContract/openPositions) —
 * it does not talk to the WebSocket directly, only drives the same hooks
 * TradeControls already uses.
 *
 * Safety properties:
 * - Never fires a second buy while one is in flight or a contract is still
 *   open (`roundActive` ref), even across rapid proposal ticks.
 * - Never buys against a stale proposal: waits for `proposal.askPrice` to
 *   actually match the intended stake before buying, since proposals stream
 *   a new id on every price tick regardless of stake changes.
 * - Checks profit/loss/max-stake limits before computing or setting the next
 *   stake, so it always stops instead of placing one more trade past a limit.
 */
export function useMartingaleAutomation({
  isConnected,
  isAuthenticated,
  stake,
  setStake,
  proposal,
  buyContract,
  isBuying,
  buyResult,
  buyError,
  clearBuyResult,
  openPositions,
}: UseMartingaleAutomationParams): UseMartingaleAutomationReturn {
  const [settings, setSettings] = useState<MartingaleSettings>(DEFAULT_MARTINGALE_SETTINGS);
  const [isRunning, setIsRunning] = useState(false);
  const [netProfit, setNetProfit] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [currentStake, setCurrentStake] = useState(DEFAULT_MARTINGALE_SETTINGS.baseStake);
  const [stopReason, setStopReason] = useState<string | null>(null);

  const roundActive = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const intendedStake = useRef<number>(DEFAULT_MARTINGALE_SETTINGS.baseStake);

  const stop = useCallback((reason?: string) => {
    setIsRunning(false);
    roundActive.current = false;
    pendingContractId.current = null;
    if (reason) setStopReason(reason);
  }, []);

  const start = useCallback(() => {
    setStopReason(null);
    setNetProfit(0);
    setTradeCount(0);
    setCurrentStake(settings.baseStake);
    intendedStake.current = settings.baseStake;
    roundActive.current = false;
    pendingContractId.current = null;
    setStake(String(settings.baseStake));
    setIsRunning(true);
  }, [settings.baseStake, setStake]);

  useEffect(() => {
    if (isRunning && (!isConnected || !isAuthenticated)) {
      stop('Connection lost — automation stopped.');
    }
  }, [isConnected, isAuthenticated, isRunning, stop]);

  // Fire the next buy once a live proposal actually reflects the intended stake.
  useEffect(() => {
    if (!isRunning) return;
    if (roundActive.current) return;
    if (isBuying) return;
    if (!proposal) return;
    if (Math.abs(proposal.askPrice - intendedStake.current) > 0.01) return;

    roundActive.current = true;
    buyContract();
  }, [isRunning, proposal, isBuying, buyContract]);

  useEffect(() => {
    if (!isRunning || !buyResult) return;
    pendingContractId.current = buyResult.contractId;
    setTradeCount((c) => c + 1);
    clearBuyResult();
  }, [buyResult, isRunning, clearBuyResult]);

  useEffect(() => {
    if (!isRunning || !buyError) return;
    stop(`Trade failed: ${buyError}`);
    clearBuyResult();
  }, [buyError, isRunning, stop, clearBuyResult]);

  // Watch openPositions for the contract currently in flight to settle.
  useEffect(() => {
    if (!isRunning || pendingContractId.current === null) return;
    const contractId = pendingContractId.current;
    const position = openPositions.find((p) => p.contract_id === contractId);
    if (!position) return;

    const isClosed = !!position.is_sold || !!position.is_expired || position.status !== 'open';
    if (!isClosed) return;

    const profit = parseFloat(position.profit);
    if (Number.isNaN(profit)) return;

    pendingContractId.current = null;

    const nextNet = netProfit + profit;
    setNetProfit(nextNet);

    if (settings.profitThreshold !== null && nextNet >= settings.profitThreshold) {
      stop(`Profit target reached: +${nextNet.toFixed(2)} USD`);
      return;
    }
    if (settings.lossThreshold !== null && nextNet <= -settings.lossThreshold) {
      stop(`Loss limit reached: ${nextNet.toFixed(2)} USD`);
      return;
    }

    const won = profit >= 0;
    const nextStake = computeNextStake(settings, parseFloat(stake), won);

    if (settings.maxStake !== null && nextStake > settings.maxStake) {
      stop(`Next stake (${nextStake.toFixed(2)} USD) would exceed max stake (${settings.maxStake} USD)`);
      return;
    }

    intendedStake.current = nextStake;
    setCurrentStake(nextStake);
    setStake(String(nextStake));
    roundActive.current = false;
  }, [openPositions, isRunning, settings, stake, netProfit, setStake, stop]);

  return {
    settings,
    setSettings,
    isRunning,
    start,
    stop,
    netProfit,
    tradeCount,
    currentStake,
    stopReason,
  };
}
