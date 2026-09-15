
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult } from '@/external/deriv-core';
import type { StrategyProgram } from '../lib/types';
import type { OpenPosition } from '../lib/types';

/** Computes the next stake after a settled trade, per the program's stake rule. */
function computeNextStake(program: StrategyProgram, currentStake: number, won: boolean): number {
  const { stakeRule, baseStake } = program;
  switch (stakeRule.type) {
    case 'martingale':
      return won ? baseStake : currentStake * stakeRule.multiplier;
    case 'dalembert':
      return won
        ? Math.max(baseStake, currentStake - stakeRule.increment)
        : currentStake + stakeRule.increment;
    case 'fixed':
      return baseStake;
    default:
      return baseStake;
  }
}
function maxStakeFor(program: StrategyProgram): number | null {
  return program.stakeRule.type === 'fixed' ? null : program.stakeRule.maxStake ?? null;
}

interface UseStrategyAutomationParams {
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

export interface UseStrategyAutomationReturn {
  isRunning: boolean;
  start: (program: StrategyProgram) => void;
  stop: () => void;
  netProfit: number;
  tradeCount: number;
  currentStake: number;
  activeProgram: StrategyProgram | null;
  stopReason: string | null;
}

/**
 * Generalized version of the Martingale-only automation hook — runs any
 * StrategyProgram (martingale / dalembert / fixed stake rule) against the
 * same manual trade primitives (proposal/buyContract/openPositions).
 *
 * Same safety properties as the original:
 * - roundActive ref blocks duplicate buys while one is in flight or open.
 * - Never buys against a stale proposal — waits for proposal.askPrice to
 *   match the intended stake first.
 * - Threshold checks run before the next stake is set, so it always stops
 *   instead of firing one more trade past a limit.
 */
export function useStrategyAutomation({
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
}: UseStrategyAutomationParams): UseStrategyAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [netProfit, setNetProfit] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [currentStake, setCurrentStake] = useState(0);
  const [activeProgram, setActiveProgram] = useState<StrategyProgram | null>(null);
  const [stopReason, setStopReason] = useState<string | null>(null);

  const roundActive = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const intendedStake = useRef<number>(0);
  const programRef = useRef<StrategyProgram | null>(null);

  const stop = useCallback((reason?: string) => {
    setIsRunning(false);
    roundActive.current = false;
    pendingContractId.current = null;
    if (reason) setStopReason(reason);
  }, []);

  const start = useCallback((program: StrategyProgram) => {
    setStopReason(null);
    setNetProfit(0);
    setTradeCount(0);
    setCurrentStake(program.baseStake);
    setActiveProgram(program);
    programRef.current = program;
    intendedStake.current = program.baseStake;
    roundActive.current = false;
    pendingContractId.current = null;
    setStake(String(program.baseStake));
    setIsRunning(true);
  }, [setStake]);

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
    const program = programRef.current;
    if (!program) return;

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

    if (program.profitThreshold !== null && nextNet >= program.profitThreshold) {
      stop(`Profit target reached: +${nextNet.toFixed(2)} USD`);
      return;
    }
    if (program.lossThreshold !== null && nextNet <= -program.lossThreshold) {
      stop(`Loss limit reached: ${nextNet.toFixed(2)} USD`);
      return;
    }

    const won = profit >= 0;
    const nextStake = computeNextStake(program, parseFloat(stake), won);
    const cap = maxStakeFor(program);

    if (cap !== null && nextStake > cap) {
      stop(`Next stake (${nextStake.toFixed(2)} USD) would exceed max stake (${cap} USD)`);
      return;
    }

    intendedStake.current = nextStake;
    setCurrentStake(nextStake);
    setStake(String(nextStake));
    roundActive.current = false;
  }, [openPositions, isRunning, stake, netProfit, setStake, stop]);

  return { isRunning, start, stop, netProfit, tradeCount, currentStake, activeProgram, stopReason };
}
