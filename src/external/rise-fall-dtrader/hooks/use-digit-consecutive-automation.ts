
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult } from '@/external/deriv-core';
import type { OpenPosition } from '../lib/types';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

export type ConsecutivePhase = 'idle' | 'collecting' | 'ready' | 'entered';

export interface ConsecutiveResult {
  contractId: number;
  profit: number;
  won: boolean;
  stake: number;
  predictedDigit: number;
}

/**
 * Third automation option for Matches/Differs, alongside Watcher
 * (use-digits-match-diff-entry-automation.ts) and Frequency
 * (use-digit-frequency-automation.ts), neither of which this file touches.
 *
 * Entrance strategy: watches consecutive ticks. The moment the SAME digit
 * lands twice in a row, fires a trade on that digit immediately. Any tick
 * that doesn't match the immediately preceding one simply becomes the new
 * "pending" digit and the wait continues — there is no window, no count,
 * no tie-break; only the last two ticks ever matter.
 *   Examples:
 *     2, 2          -> fires on 2 the instant the second 2 lands
 *     1, 2, 1, 3     -> never fires; each tick breaks the previous one's
 *                       streak, so it just keeps waiting
 * The live display mirrors this exactly: while a digit is "pending" (seen
 * once, waiting to see if it repeats) it shows at 50%; the instant it
 * repeats it jumps to 100% and the trade fires; then it resets to empty
 * and starts waiting for the next candidate digit.
 *
 * Risk management: same boost-after-loss / stop-loss / take-profit rule
 * as the Frequency bot. A loss at the base stake boosts the stake by
 * `boostMultiplier` for the next `boostRounds` rounds, regardless of
 * whether those rounds win or lose, then automatically reverts to base.
 * `stopLoss` and `takeProfit` (both 0 = disabled) independently end the
 * run early based on cumulative profit, on top of the `maxRounds` cap.
 *
 * Architecture note: same async proposal/buyContract purchase flow as the
 * other two Matches/Differs bots — once a repeat is detected, this hook
 * waits for a fresh proposal priced for that digit + stake before firing.
 *
 * BUGFIX (double-tick / same-digit-in-a-row not detected): the COLLECT
 * effect below used to depend only on `lastDigit`, a plain number. React
 * skips re-running an effect when a dependency's value is unchanged
 * (Object.is) — so two consecutive ticks that happen to land on the SAME
 * digit (e.g. 6 then 6) never re-triggered this effect at all, meaning
 * the exact "two in a row" case this bot is built around could silently
 * fail to fire. Fixed by also depending on `tickEpoch`, which changes on
 * every tick even when the digit repeats, so no tick is ever skipped.
 */
export interface ConsecutiveAutomationSettings {
  /** Hard cap on rounds placed before the run stops on its own. */
  maxRounds: number;
  /** Stake multiplier applied for `boostRounds` rounds after a loss at
   *  the base stake (e.g. 4 means 4x base stake). */
  boostMultiplier: number;
  /** How many rounds stay boosted after a base-stake loss, regardless of
   *  whether those boosted rounds win or lose. */
  boostRounds: number;
  /** Cumulative loss (positive number, USD) at which the run stops
   *  itself early. 0 disables this check. */
  stopLoss: number;
  /** Cumulative profit (positive number, USD) at which the run stops
   *  itself early. 0 disables this check. */
  takeProfit: number;
}

export const DEFAULT_CONSECUTIVE_SETTINGS: ConsecutiveAutomationSettings = {
  maxRounds: 5,
  boostMultiplier: 4,
  boostRounds: 2,
  stopLoss: 0,
  takeProfit: 0,
};

interface UseDigitConsecutiveAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  contractMode: ContractMode;
  lastDigit: number | null;
  /**
   * BUGFIX — the current tick's epoch (unix timestamp), used purely as a
   * change-detection signal alongside lastDigit. See the file header note
   * above for why this is necessary. Optional so any other caller of this
   * hook that hasn't been updated yet doesn't break — if omitted, the
   * hook falls back to the old (buggy) behavior of only watching
   * lastDigit.
   */
  tickEpoch?: number | null;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  stake: string;
  setStake: (value: string) => void;
  selectedDigit: number;
  setSelectedDigit: (digit: number) => void;
}

export interface UseDigitConsecutiveAutomationReturn {
  isRunning: boolean;
  phase: ConsecutivePhase;
  isValidSetup: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  lastResult: ConsecutiveResult | null;
  results: ConsecutiveResult[];
  lastError: string | null;
  statusMessage: string;
  settings: ConsecutiveAutomationSettings;
  setSettings: (settings: ConsecutiveAutomationSettings) => void;
  roundCount: number;
  netProfit: number;
  stopReason: string | null;
  /** Live 2-slot display: the pending digit's slot is 1 (50%, waiting for
   *  a repeat) or 2 (100%, just matched) out of a fixed denominator of 2.
   *  Every other digit's slot is 0. Index = digit. */
  freqCounts: number[];
  /** Fixed at 2 once a cycle has started (denominator for the percentage
   *  display), 0 before the first tick of a fresh cycle. */
  ticksCollected: number;
  predictedDigit: number | null;
}

function emptyCounts(): number[] {
  return new Array(10).fill(0);
}

export function useDigitConsecutiveAutomation({
  isConnected,
  isAuthenticated,
  contractMode,
  lastDigit,
  tickEpoch,
  proposal,
  buyContract,
  isBuying,
  buyResult,
  buyError,
  clearBuyResult,
  openPositions,
  stake,
  setStake,
  selectedDigit,
  setSelectedDigit,
}: UseDigitConsecutiveAutomationParams): UseDigitConsecutiveAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<ConsecutivePhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<ConsecutiveResult | null>(null);
  const [results, setResults] = useState<ConsecutiveResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConsecutiveAutomationSettings>(DEFAULT_CONSECUTIVE_SETTINGS);
  const [roundCount, setRoundCount] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [freqCounts, setFreqCounts] = useState<number[]>(emptyCounts());
  const [ticksCollected, setTicksCollected] = useState(0);
  const [predictedDigit, setPredictedDigit] = useState<number | null>(null);

  const isRunningRef = useRef(false);
  const phaseRef = useRef<ConsecutivePhase>('idle');
  const settingsRef = useRef<ConsecutiveAutomationSettings>(DEFAULT_CONSECUTIVE_SETTINGS);
  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const currentStakeRef = useRef(0);
  // Base stake for the run (what the trader configured) — boosted rounds
  // are computed as a multiple of this, not of whatever currentStakeRef
  // happens to be, so boosts never compound on top of each other.
  const baseStakeRef = useRef(0);
  // How many upcoming rounds (including the one about to be placed) still
  // owe a boosted stake. Sits at 0 when at base stake.
  const boostRoundsLeftRef = useRef(0);
  // The digit currently "pending" — seen on the previous tick, waiting to
  // see whether the next tick repeats it. Null = nothing pending yet.
  const pendingDigitRef = useRef<number | null>(null);
  const latestProposalRef = useRef<ProposalInfo | null>(null);
  const staleProposalId = useRef<string | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    latestProposalRef.current = proposal;
  }, [proposal]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const isValidSetup = contractMode === 'DIGITMATCH' || contractMode === 'DIGITDIFF';

  const setPhaseBoth = (next: ConsecutivePhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const start = useCallback(() => {
    const parsedStake = parseFloat(stake);
    const startingStake = Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : 0;

    hasFired.current = false;
    pendingContractId.current = null;
    isRunningRef.current = true;
    currentStakeRef.current = startingStake;
    baseStakeRef.current = startingStake;
    boostRoundsLeftRef.current = 0;
    pendingDigitRef.current = null;
    staleProposalId.current = null;

    setActiveContractId(null);
    setLastResult(null);
    setResults([]);
    setLastError(null);
    setStopReason(null);
    setRoundCount(0);
    setNetProfit(0);
    setFreqCounts(emptyCounts());
    setTicksCollected(0);
    setPredictedDigit(null);
    setPhaseBoth('collecting');
    setIsRunning(true);
  }, [stake]);

  const stop = useCallback((reason?: string) => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (!hasFired.current) {
      setPhaseBoth('idle');
      pendingContractId.current = null;
    }
    if (reason) {
      setLastError(reason);
      setStopReason(reason);
    }
  }, []);

  useEffect(() => {
    if (isRunning && (!isConnected || !isAuthenticated)) {
      stop('Connection lost — automation stopped.');
    }
  }, [isConnected, isAuthenticated, isRunning, stop]);

  // COLLECT — consecutive-match detector. Every tick either confirms a
  // repeat of the pending digit (fire) or becomes the new pending digit
  // (keep waiting). No window, no tally across many digits — only the
  // immediately preceding tick ever matters.
  //
  // BUGFIX: depends on both lastDigit AND tickEpoch. lastDigit alone is
  // not enough — React's Object.is dependency check means an effect does
  // not re-run when a dependency's value is identical to last time, so
  // back-to-back ticks landing on the same digit (e.g. 6 then 6) would
  // never re-trigger this effect if it only watched lastDigit. tickEpoch
  // changes on literally every tick regardless of digit, so it forces the
  // effect to run every time, closing that gap.
  useEffect(() => {
    if (!isRunningRef.current) return;
    if (lastDigit === null) return;

    if (pendingDigitRef.current === null) {
      // First tick of a fresh cycle — nothing to compare against yet.
      pendingDigitRef.current = lastDigit;
      const counts = emptyCounts();
      counts[lastDigit] = 1;
      setFreqCounts(counts);
      setTicksCollected(2);
      return;
    }

    if (lastDigit === pendingDigitRef.current) {
      // Match — two in a row. Fire.
      const counts = emptyCounts();
      counts[lastDigit] = 2;
      setFreqCounts(counts);
      setTicksCollected(2);
      setPredictedDigit(lastDigit);

      if (lastDigit !== selectedDigit) {
        staleProposalId.current = latestProposalRef.current?.id ?? null;
        setSelectedDigit(lastDigit);
      }

      if (phaseRef.current === 'collecting') {
        setPhaseBoth('ready');
      }
      pendingDigitRef.current = null;
    } else {
      // Streak broken — restart with this tick as the new pending digit.
      pendingDigitRef.current = lastDigit;
      const counts = emptyCounts();
      counts[lastDigit] = 1;
      setFreqCounts(counts);
      setTicksCollected(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDigit, tickEpoch]);

  // BUY — fires once a live proposal reflects the predicted digit + intended stake.
  useEffect(() => {
    if (!isRunning || phase !== 'ready') return;
    if (hasFired.current) return;
    if (isBuying) return;
    if (!proposal) return;
    if (staleProposalId.current !== null && proposal.id === staleProposalId.current) return;
    if (Math.abs(proposal.askPrice - currentStakeRef.current) > 0.01) return;

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
  }, [buyError, phase, clearBuyResult]);

  // SETTLE — round count, boost-after-loss stake sizing, then the three
  // stop checks (max rounds, stop-loss, take-profit), same pattern as the
  // Frequency bot.
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
    const nextRoundCount = roundCount + 1;
    const nextNet = netProfit + profit;
    const roundStake = currentStakeRef.current;

    const result: ConsecutiveResult = {
      contractId,
      profit,
      won,
      stake: roundStake,
      predictedDigit: selectedDigit,
    };
    setLastResult(result);
    setResults((prev) => [...prev, result]);
    setRoundCount(nextRoundCount);
    setNetProfit(nextNet);
    pendingContractId.current = null;
    setActiveContractId(null);
    hasFired.current = false;

    if (!isRunningRef.current) {
      setPhaseBoth('idle');
      setIsRunning(false);
      return;
    }

    // Boost-after-loss stake sizing for the NEXT round. A loss at the
    // base stake starts a boosted streak of `boostRounds` rounds at
    // base * boostMultiplier, regardless of whether those boosted rounds
    // win or lose; once the streak completes, it reverts to base.
    const { boostMultiplier, boostRounds, stopLoss, takeProfit, maxRounds } = settingsRef.current;
    if (boostRoundsLeftRef.current > 0) {
      boostRoundsLeftRef.current -= 1;
      currentStakeRef.current =
        boostRoundsLeftRef.current > 0 ? baseStakeRef.current * boostMultiplier : baseStakeRef.current;
    } else if (!won) {
      boostRoundsLeftRef.current = boostRounds;
      currentStakeRef.current = baseStakeRef.current * boostMultiplier;
    } else {
      currentStakeRef.current = baseStakeRef.current;
    }
    setStake(String(currentStakeRef.current));

    if (nextRoundCount >= maxRounds) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Reached max rounds (${maxRounds}).`);
      return;
    }

    if (stopLoss > 0 && nextNet <= -stopLoss) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Stop-loss reached (down ${Math.abs(nextNet).toFixed(2)} USD).`);
      return;
    }

    if (takeProfit > 0 && nextNet >= takeProfit) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Take-profit reached (up ${nextNet.toFixed(2)} USD).`);
      return;
    }

    // Reset and start waiting for the next candidate digit.
    pendingDigitRef.current = null;
    setFreqCounts(emptyCounts());
    setTicksCollected(0);
    setPredictedDigit(null);

    if (phaseRef.current !== 'ready') {
      setPhaseBoth('collecting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPositions, phase, roundCount, netProfit, selectedDigit, setStake]);

  const activePosition =
    activeContractId !== null
      ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null)
      : null;

  const statusMessage = !isValidSetup
    ? 'This bot only supports Matches/Differs.'
    : phase === 'collecting'
    ? `Waiting for a repeat — round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}.`
    : phase === 'ready'
    ? `Ready — round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}.`
    : phase === 'entered'
    ? 'Trade placed — waiting for it to settle.'
    : 'Idle';

  return {
    isRunning,
    phase,
    isValidSetup,
    start,
    stop,
    activePosition,
    lastResult,
    results,
    lastError,
    statusMessage,
    settings,
    setSettings,
    roundCount,
    netProfit,
    stopReason,
    freqCounts,
    ticksCollected,
    predictedDigit,
  };
}
