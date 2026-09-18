import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult } from '@deriv/core';
import type { OpenPosition, Direction } from '../lib/types';

export type StreakPhase = 'idle' | 'collecting' | 'ready' | 'entered';
export type StakeRule = 'martingale' | 'dalembert';

export interface StreakResult {
  contractId: number;
  profit: number;
  won: boolean;
  stake: number;
  direction: Direction;
}

/**
 * Streak-reversal automation for Rise/Fall — new fourth entry mode
 * alongside plain Martingale/D'Alembert (use-martingale-automation.ts).
 *
 * Entrance strategy: watches the last `streakLength` ticks. The moment
 * every consecutive pair moves the same direction (a clean, unbroken
 * run — no flat ticks, no reversals in between), fires a trade betting
 * on the reversal: N rises in a row -> buy PUT, N falls in a row -> buy
 * CALL. Any tick that breaks the run simply becomes the start of a new
 * window; there is no waiting period, the sliding window re-checks on
 * every tick.
 *
 * Same "boost after loss" stake model as the plain Martingale/D'Alembert
 * hook, and the same never-buy-against-a-stale-proposal safety property:
 * waits for proposal.askPrice to match the intended stake before buying.
 *
 * Risk management: maxLossRuns (consecutive losses), profitThreshold,
 * lossThreshold (cumulative USD), and maxStake — all optional (null =
 * disabled), same convention as the rest of this codebase's automation
 * hooks.
 */
export interface StreakReversalSettings {
  /** How many consecutive same-direction ticks confirm a streak. */
  streakLength: number;
  baseStake: number;
  stakeRule: StakeRule;
  /** Martingale only. */
  multiplier: number;
  /** D'Alembert only. */
  increment: number;
  /** Hard ceiling on stake — run stops instead of placing a trade past it. Null = no cap. */
  maxStake: number | null;
  /** Stop once cumulative profit reaches +this amount. Null = no target. */
  profitThreshold: number | null;
  /** Stop once cumulative profit reaches -this amount. Null = no limit. */
  lossThreshold: number | null;
  /** Stop after this many consecutive losses. Null = unlimited. */
  maxLossRuns: number | null;
  allowEquals: boolean;
}

export const DEFAULT_STREAK_SETTINGS: StreakReversalSettings = {
  streakLength: 5,
  baseStake: 10,
  stakeRule: 'martingale',
  multiplier: 2,
  increment: 10,
  maxStake: null,
  profitThreshold: 40,
  lossThreshold: null,
  maxLossRuns: 7,
  allowEquals: false,
};

interface UseStreakReversalAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  lastQuote: number | null;
  /** Tick epoch — forces the collect effect to run on every tick, even
   *  when the quote itself repeats. Same fix as use-digit-consecutive-
   *  automation.ts's tickEpoch dependency, for the same reason. */
  lastTickEpoch?: number | null;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  stake: string;
  setStake: (value: string) => void;
  direction: Direction;
  setDirection: (direction: Direction) => void;
}

export interface UseStreakReversalAutomationReturn {
  isRunning: boolean;
  phase: StreakPhase;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  results: StreakResult[];
  lastError: string | null;
  statusMessage: string;
  settings: StreakReversalSettings;
  setSettings: (settings: StreakReversalSettings) => void;
  netProfit: number;
  lossRunCount: number;
  currentStake: number;
  stopReason: string | null;
  /** Live view of the tick window being watched, oldest first. */
  windowTicks: number[];
}

function computeNextStake(settings: StreakReversalSettings, currentStake: number, won: boolean): number {
  if (settings.stakeRule === 'martingale') {
    return won ? settings.baseStake : currentStake * settings.multiplier;
  }
  return won
    ? Math.max(settings.baseStake, currentStake - settings.increment)
    : currentStake + settings.increment;
}

export function useStreakReversalAutomation({
  isConnected,
  isAuthenticated,
  lastQuote,
  lastTickEpoch,
  proposal,
  buyContract,
  isBuying,
  buyResult,
  buyError,
  clearBuyResult,
  openPositions,
  stake,
  setStake,
  direction,
  setDirection,
}: UseStreakReversalAutomationParams): UseStreakReversalAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<StreakPhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [results, setResults] = useState<StreakResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<StreakReversalSettings>(DEFAULT_STREAK_SETTINGS);
  const [netProfit, setNetProfit] = useState(0);
  const [lossRunCount, setLossRunCount] = useState(0);
  const [currentStake, setCurrentStake] = useState(DEFAULT_STREAK_SETTINGS.baseStake);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [windowTicks, setWindowTicks] = useState<number[]>([]);

  const isRunningRef = useRef(false);
  const phaseRef = useRef<StreakPhase>('idle');
  const settingsRef = useRef<StreakReversalSettings>(DEFAULT_STREAK_SETTINGS);
  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const intendedStake = useRef(0);
  const windowRef = useRef<number[]>([]);
  const latestProposalRef = useRef<ProposalInfo | null>(null);
  const staleProposalId = useRef<string | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { latestProposalRef.current = proposal; }, [proposal]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const setPhaseBoth = (next: StreakPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const stop = useCallback((reason?: string) => {
    isRunningRef.current = false;
    setIsRunning(false);
    setPhaseBoth('idle');
    if (reason) setStopReason(reason);
  }, []);

  const start = useCallback(() => {
    const cfg = settingsRef.current;
    setStopReason(null);
    setNetProfit(0);
    setLossRunCount(0);
    setResults([]);
    hasFired.current = false;
    pendingContractId.current = null;
    windowRef.current = [];
    setWindowTicks([]);
    intendedStake.current = cfg.baseStake;
    setCurrentStake(cfg.baseStake);
    setStake(String(cfg.baseStake));
    isRunningRef.current = true;
    setIsRunning(true);
    setPhaseBoth('collecting');
  }, [setStake]);

  useEffect(() => {
    if (isRunning && (!isConnected || !isAuthenticated)) {
      stop('Connection lost — automation stopped.');
    }
  }, [isConnected, isAuthenticated, isRunning, stop]);

  // COLLECT — sliding-window streak detector. Every tick either extends
  // the window and re-checks for a clean N-in-a-row run (fires
  // immediately on the SAME tick that confirms it — a loss on an
  // extending streak re-fires next cycle without waiting, since the
  // window just slides forward) or, if the run is broken, keeps sliding
  // without ever pausing to "reset and wait from zero."
  useEffect(() => {
    if (!isRunningRef.current) return;
    if (lastQuote === null) return;
    // Only the 'collecting' phase does streak detection. While 'ready' or
    // 'entered' — including the whole loss-chase sequence, which sets
    // 'ready' directly without going through detection — this effect
    // still tracks the window for display, but must not touch direction
    // or phase, since a loss-chase is deliberately not gated on the
    // streak condition reappearing.
    if (phaseRef.current === 'entered') return; // don't evaluate new entries while a contract is open

    const cfg = settingsRef.current;
    const next = [...windowRef.current, lastQuote].slice(-(cfg.streakLength + 1));
    windowRef.current = next;
    setWindowTicks(next);

    if (phaseRef.current !== 'collecting') return; // loss-chase in progress — direction/phase already decided

    if (next.length < cfg.streakLength + 1) return;

    let allRising = true;
    let allFalling = true;
    for (let i = 1; i < next.length; i++) {
      if (!(next[i] > next[i - 1])) allRising = false;
      if (!(next[i] < next[i - 1])) allFalling = false;
    }

    if (allRising || allFalling) {
      const nextDirection: Direction = allRising ? 'PUT' : 'CALL';
      if (nextDirection !== direction) {
        staleProposalId.current = latestProposalRef.current?.id ?? null;
        setDirection(nextDirection);
      }
      setPhaseBoth('ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastQuote, lastTickEpoch]);

  // BUY — fires once a live proposal reflects the confirmed direction + intended stake.
  useEffect(() => {
    if (!isRunning || phase !== 'ready') return;
    if (hasFired.current) return;
    if (isBuying) return;
    if (!proposal) return;
    if (staleProposalId.current !== null && proposal.id === staleProposalId.current) return;
    if (Math.abs(proposal.askPrice - intendedStake.current) > 0.01) return;

    staleProposalId.current = null;
    hasFired.current = true;
    buyContract();
  }, [isRunning, phase, proposal, isBuying, buyContract]);

  useEffect(() => {
    if (!hasFired.current || phase !== 'ready' || !buyResult) return;
    pendingContractId.current = buyResult.contractId;
    setActiveContractId(buyResult.contractId);
    setPhaseBoth('entered');
    clearBuyResult();
  }, [buyResult, phase, clearBuyResult]);

  useEffect(() => {
    if (!hasFired.current || phase !== 'ready' || !buyError) return;
    hasFired.current = false;
    setLastError(buyError);
    clearBuyResult();
    // Streak may already have moved on — drop back to collecting rather
    // than getting stuck in 'ready' with nothing to retry.
    setPhaseBoth('collecting');
  }, [buyError, phase, clearBuyResult]);

  // SETTLE — stake sizing, loss-run counting, then the three stop checks
  // (max consecutive losses, loss threshold, profit threshold, max stake),
  // same pattern as the other automation hooks in this codebase.
  useEffect(() => {
    if (phase !== 'entered') return;
    const contractId = pendingContractId.current;
    if (contractId === null) return;

    const position = openPositions.find((p) => p.contract_id === contractId);
    if (!position) return;
    const isClosed = !!position.is_sold || !!position.is_expired || position.status !== 'open';
    if (!isClosed) return;

    const profit = parseFloat(position.profit);
    const won = profit >= 0;
    const nextNet = netProfit + profit;
    const roundStake = intendedStake.current;

    const result: StreakResult = { contractId, profit, won, stake: roundStake, direction };
    setResults((prev) => [...prev, result]);
    setNetProfit(nextNet);
    pendingContractId.current = null;
    setActiveContractId(null);
    hasFired.current = false;

    const nextLossRun = won ? 0 : lossRunCount + 1;
    setLossRunCount(nextLossRun);

    if (!isRunningRef.current) {
      setPhaseBoth('idle');
      setIsRunning(false);
      return;
    }

    const cfg = settingsRef.current;

    if (cfg.profitThreshold !== null && nextNet >= cfg.profitThreshold) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Take-profit reached (up ${nextNet.toFixed(2)} USD).`);
      return;
    }
    if (cfg.lossThreshold !== null && nextNet <= -cfg.lossThreshold) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Loss threshold reached (down ${Math.abs(nextNet).toFixed(2)} USD).`);
      return;
    }
    if (cfg.maxLossRuns !== null && nextLossRun >= cfg.maxLossRuns) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Stop-loss hit: ${nextLossRun} consecutive losses. Discipline over ego.`);
      return;
    }

    const nextStake = computeNextStake(cfg, roundStake, won);
    if (cfg.maxStake !== null && nextStake > cfg.maxStake) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Next stake (${nextStake.toFixed(2)} USD) would exceed max stake (${cfg.maxStake} USD).`);
      return;
    }

    intendedStake.current = nextStake;
    setCurrentStake(nextStake);
    setStake(String(nextStake));

    if (won) {
      // Recovery complete — this is the only thing that ends a chase.
      // Go back to watching for a fresh streak from scratch.
      setPhaseBoth('collecting');
    } else {
      // Loss — do NOT wait for the streak condition to reappear. Fire
      // again immediately in the SAME direction at the new (bigger)
      // stake, so every tick from here on has an active contract with
      // no gap, until a win breaks the chase. The BUY effect below
      // picks this up the moment a live proposal matches the new stake.
      setPhaseBoth('ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPositions, phase, netProfit, lossRunCount, direction, setStake]);

  const activePosition =
    activeContractId !== null
      ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null)
      : null;

  const statusMessage =
    phase === 'collecting'
      ? `Watching — ${windowTicks.length}/${settings.streakLength + 1} ticks, ${lossRunCount} consecutive loss${lossRunCount === 1 ? '' : 'es'}.`
      : phase === 'ready' && lossRunCount === 0
      ? `Streak confirmed — entering ${direction === 'CALL' ? 'Rise' : 'Fall'}.`
      : phase === 'ready'
      ? `Loss ${lossRunCount} — chasing recovery, re-entering ${direction === 'CALL' ? 'Rise' : 'Fall'} immediately.`
      : phase === 'entered'
      ? 'Trade placed — waiting for it to settle.'
      : 'Idle';

  return {
    isRunning,
    phase,
    start,
    stop,
    activePosition,
    results,
    lastError,
    statusMessage,
    settings,
    setSettings,
    netProfit,
    lossRunCount,
    currentStake,
    stopReason,
    windowTicks,
  };
}
