
import { useState, useRef, useEffect, useCallback } from 'react';
import type { BuyResult, OpenPosition } from '../lib/types';
import type { Tick } from '@deriv/core';
import type { AccumulatorProposalInfo } from './use-accumulator-proposal';
import type { AccumulatorAutomationSettings } from '@/external/rise-fall-dtrader/lib/accumulator-types';
import { DEFAULT_ACCUMULATOR_AUTOMATION_SETTINGS } from '@/external/rise-fall-dtrader/lib/accumulator-types';

export type { AccumulatorAutomationSettings };
export { DEFAULT_ACCUMULATOR_AUTOMATION_SETTINGS };

interface UseAccumulatorAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  stake: string;
  setStake: (value: string) => void;
  proposal: AccumulatorProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  currentTick: Tick | null;
  openPositions: OpenPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
}

export interface UseAccumulatorAutomationReturn {
  settings: AccumulatorAutomationSettings;
  setSettings: (settings: AccumulatorAutomationSettings) => void;
  isRunning: boolean;
  /** True once a contract exists that still needs to be sold/settled, even after Stop. */
  isClosing: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  netProfit: number;
  tradeCount: number;
  stopReason: string | null;
  activePosition: OpenPosition | null;
}

export function useAccumulatorAutomation({
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
  currentTick,
  openPositions,
  sellContract,
  sellingId,
  sellError,
  clearSellError,
}: UseAccumulatorAutomationParams): UseAccumulatorAutomationReturn {
  const [settings, setSettings] = useState<AccumulatorAutomationSettings>(
    DEFAULT_ACCUMULATOR_AUTOMATION_SETTINGS
  );
  const [isRunning, setIsRunning] = useState(false);
  const [netProfit, setNetProfit] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [activeContractId, setActiveContractId] = useState<number | null>(null);

  const roundActive = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const sellInitiated = useRef(false);
  const intendedStake = useRef<number>(DEFAULT_ACCUMULATOR_AUTOMATION_SETTINGS.baseStake);
  const netProfitRef = useRef(0);
  const tradeCountRef = useRef(0);
  const ticksSinceBuy = useRef(0);
  const lastTickEpoch = useRef<number | null>(null);
  const capturedProfit = useRef(0);

  // Must have seen the position in openPositions at least once before we can
  // treat its absence as "closed" rather than "not subscribed yet".
  const positionEverSeen = useRef(false);

  // Set when Stop is requested (by the user or by a settlement rule) while a
  // contract is still pending. Kept true — independent of isRunning — until
  // that contract is actually sold and confirmed closed. This is what
  // prevents the bot from silently abandoning a just-bought contract that
  // hasn't shown up in the openPositions feed yet.
  const stopRequested = useRef(false);

  const sellContractRef = useRef(sellContract);
  const openPositionsRef = useRef(openPositions);
  useEffect(() => { sellContractRef.current = sellContract; });
  useEffect(() => { openPositionsRef.current = openPositions; });

  const resetRoundState = () => {
    pendingContractId.current = null;
    sellInitiated.current = false;
    ticksSinceBuy.current = 0;
    lastTickEpoch.current = null;
    positionEverSeen.current = false;
    stopRequested.current = false;
  };

  const stop = useCallback((reason?: string) => {
    setIsRunning(false);
    if (reason) setStopReason(reason);

    const contractId = pendingContractId.current;

    if (contractId === null || sellInitiated.current) {
      // Nothing pending (or already being sold) — safe to fully reset.
      roundActive.current = false;
      if (contractId === null) resetRoundState();
      return;
    }

    // A contract is pending. Flag it so the close-watcher effect below keeps
    // trying to sell it — even after isRunning goes false — instead of the
    // old behaviour of giving up the instant this synchronous check misses.
    stopRequested.current = true;

    const position = openPositionsRef.current.find((p) => p.contract_id === contractId);
    if (position) positionEverSeen.current = true;

    if (position && !position.is_sold && !position.is_expired) {
      sellInitiated.current = true;
      capturedProfit.current = parseFloat(position.bid_price) - intendedStake.current;
      sellContractRef.current(contractId, position.bid_price);
    }
    // If position isn't visible yet, do nothing here — the close-watcher
    // effect (keyed on openPositions) will sell it the moment it appears.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    setStopReason(null);
    setNetProfit(0);
    setTradeCount(0);
    netProfitRef.current = 0;
    tradeCountRef.current = 0;
    roundActive.current = false;
    resetRoundState();
    setActiveContractId(null);
    intendedStake.current = settings.baseStake;
    setStake(String(settings.baseStake));
    setIsRunning(true);
  }, [settings.baseStake, setStake]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isRunning && (!isConnected || !isAuthenticated)) {
      stop('Connection lost — automation stopped.');
    }
  }, [isConnected, isAuthenticated, isRunning, stop]);

  // Don't allow a new round to start while a previous contract is still
  // being closed out — start() would otherwise wipe pendingContractId and
  // orphan it, reintroducing the same abandonment bug from a different angle.
  useEffect(() => {
    if (!isRunning) return;
    if (roundActive.current) return;
    if (pendingContractId.current !== null) return;
    if (isBuying) return;
    if (!proposal) return;
    if (Math.abs(proposal.askPrice - intendedStake.current) > 0.01) return;
    roundActive.current = true;
    buyContract();
  }, [isRunning, proposal, isBuying, buyContract]);

  useEffect(() => {
    if (!isRunning || !buyResult) return;
    pendingContractId.current = buyResult.contractId;
    setActiveContractId(buyResult.contractId);
    sellInitiated.current = false;
    ticksSinceBuy.current = 0;
    lastTickEpoch.current = null;
    positionEverSeen.current = false;
    stopRequested.current = false;
    tradeCountRef.current += 1;
    setTradeCount(tradeCountRef.current);
    clearBuyResult();
  }, [buyResult, isRunning, clearBuyResult]);

  useEffect(() => {
    if (!isRunning || !buyError) return;
    stop(`Trade failed: ${buyError}`);
    clearBuyResult();
  }, [buyError, isRunning, stop, clearBuyResult]);

  useEffect(() => {
    if (!isRunning || !sellError) return;
    stop(`Sell failed: ${sellError}`);
    clearSellError();
  }, [sellError, isRunning, stop, clearSellError]);

  // PHASE 1 — while running, count live market ticks and sell once the
  // configured hold period is reached.
  useEffect(() => {
    if (!isRunning || pendingContractId.current === null) return;
    if (sellInitiated.current || stopRequested.current) return;
    if (!currentTick) return;

    const epoch = (currentTick as { epoch?: number }).epoch ?? null;
    if (epoch !== null && epoch === lastTickEpoch.current) return;
    lastTickEpoch.current = epoch;
    ticksSinceBuy.current += 1;

    console.log('[accumulator-bot] tick', ticksSinceBuy.current, '/ target', settings.ticksToHold);
    if (ticksSinceBuy.current < settings.ticksToHold) return;

    const contractId = pendingContractId.current;
    const position = openPositions.find((p) => p.contract_id === contractId);
    if (position) positionEverSeen.current = true;

    if (!position || !!position.is_sold || !!position.is_expired) {
      capturedProfit.current = 0;
      sellInitiated.current = true;
      return;
    }

    capturedProfit.current = parseFloat(position.bid_price) - intendedStake.current;
    console.log('[accumulator-bot] selling — estimated profit', capturedProfit.current.toFixed(2));
    sellInitiated.current = true;
    sellContract(contractId, position.bid_price);
  }, [currentTick, isRunning, openPositions, settings.ticksToHold, sellContract]);

  // CLOSE WATCHER — runs regardless of isRunning. Handles the case where
  // Stop (manual or automatic) was requested before the freshly bought
  // contract had appeared in openPositions yet. Keeps watching every time
  // openPositions updates and sells the instant the contract becomes
  // visible, instead of giving up the way the old code did.
  useEffect(() => {
    if (!stopRequested.current) return;
    if (pendingContractId.current === null) return;
    if (sellInitiated.current) return;

    const contractId = pendingContractId.current;
    const position = openPositions.find((p) => p.contract_id === contractId);
    if (!position) return; // still waiting for the subscription to catch up

    positionEverSeen.current = true;

    if (position.is_sold || position.is_expired) {
      // Already closed server-side (e.g. it expired naturally) — nothing to sell.
      sellInitiated.current = true;
      return;
    }

    sellInitiated.current = true;
    capturedProfit.current = parseFloat(position.bid_price) - intendedStake.current;
    sellContract(contractId, position.bid_price);
  }, [openPositions, sellContract]);

  // PHASE 2 — settle the round once the contract is confirmed closed.
  // Gated on pendingContractId/sellInitiated only (NOT isRunning), so a
  // contract closed via Stop still gets settled and cleaned up properly.
  useEffect(() => {
    if (!sellInitiated.current || pendingContractId.current === null) return;

    const contractId = pendingContractId.current;
    const position = openPositions.find((p) => p.contract_id === contractId);
    if (position) positionEverSeen.current = true;
    if (!positionEverSeen.current) return; // haven't confirmed we've ever seen it
    if (sellingId === contractId) return; // sell call still in flight
    if (position && !position.is_sold && !position.is_expired) return; // still open

    // Prefer the authoritative profit reported by Deriv on the final push;
    // fall back to our pre-sell estimate if the position already aged out
    // of openPositions before this effect ran.
    const profit = position ? parseFloat(position.profit) : capturedProfit.current;

    const wasStopRequested = stopRequested.current;
    resetRoundState();
    setActiveContractId(null);

    const nextNet = netProfitRef.current + profit;
    netProfitRef.current = nextNet;
    setNetProfit(nextNet);

    if (wasStopRequested) {
      // Stop already flipped isRunning off; nothing more to do.
      return;
    }

    if (nextNet >= settings.targetProfit) {
      stop(`Profit target reached: +${nextNet.toFixed(2)} USD`);
      return;
    }

    if (tradeCountRef.current >= settings.maxTrades) {
      stop(`Max trades (${settings.maxTrades}) reached`);
      return;
    }

    roundActive.current = false;
  }, [openPositions, sellingId, settings, stop]);

  const activePosition =
    activeContractId !== null
      ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null)
      : null;

  // Derived from state (not the ref) so it reliably triggers re-renders.
  const isClosing = !isRunning && activeContractId !== null;

  return {
    settings,
    setSettings,
    isRunning,
    isClosing,
    start,
    stop,
    netProfit,
    tradeCount,
    stopReason,
    activePosition,
  };
}
