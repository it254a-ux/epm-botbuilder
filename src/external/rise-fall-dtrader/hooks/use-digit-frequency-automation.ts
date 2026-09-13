
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult } from '@deriv/core';
import type { OpenPosition } from '../lib/types';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

export type FrequencyPhase = 'idle' | 'collecting' | 'ready' | 'entered';

export interface FrequencyResult {
  contractId: number;
  profit: number;
  won: boolean;
  /** The stake this specific round was placed at (base stake, or elevated after a loss). */
  stake: number;
  /** The digit predicted (most frequent over the stats window) that this round actually traded on. */
  predictedDigit: number;
}

/**
 * NEW — second automation option for Matches/Differs, separate from the
 * entry-watcher bot in use-digits-match-diff-entry-automation.ts (untouched
 * by this file). Ported from the uploaded Deriv Bot (DBot) XML strategy
 * ("digit_matches_differs_overlap5_strategy"), then refined against a set
 * of worked examples to match the intended behavior exactly:
 *
 * - Watches an UNBOUNDED window of ticks, tallying how often each digit
 *   0-9 appears as the last digit. After every tick, checks whether one
 *   digit is BOTH (a) strictly alone in the lead — no tie with any other
 *   digit's count — and (b) has reached at least `minLeadCount`
 *   occurrences. Only when both hold does it fire; otherwise it keeps
 *   collecting, however many ticks that takes. There is no upper cap —
 *   a run of evenly-spread ticks can extend the window indefinitely until
 *   a genuine, un-tied leader emerges.
 *   Examples this was verified against:
 *     3,3,3             -> fires on 3 right after the 3rd tick (unique + count 3)
 *     7,4,6,7,7          -> fires on 7 on the 5th tick (unique + count 3)
 *     7,4,6,7,1          -> does NOT fire (7 leads with only count 2 -> waits)
 *     1,1,3,5,3,7,7,5,5  -> does NOT fire until the 9th tick (5 finally
 *                           reaches a unique lead with count 3)
 * - Fires a trade on the predicted digit as DIGITMATCH or DIGITDIFF
 *   depending on contractMode (passed down from the shared Matches/Differs
 *   toggle, replacing the XML's separate Mode variable).
 * - After a loss at the base stake, elevates the stake to
 *   baseStake × boostMultiplier (default ×4) and holds it there — flat,
 *   not compounding — for exactly `boostRounds` (default 2) further
 *   rounds, win or lose, before automatically dropping back to base. This
 *   mirrors the XML's BoostLeft counter exactly.
 * - Stops on whichever of these is hit first: maxRounds reached,
 *   cumulative loss ≥ lossThreshold, or cumulative profit ≥
 *   profitThreshold (matching the XML's RoundCount/SLThreshold/TakeProfit
 *   checks in after_purchase).
 * - The instant a trade fires, the window resets to empty and starts
 *   collecting fresh ticks again for the next round (same as before).
 *
 * Architecture note: the original DBot script runs tick-by-tick inside the
 * platform's own trade engine and can fire a purchase instantly the moment
 * its stats are ready. This app instead buys through an async
 * proposal/buyContract pair, so once the predicted digit is set this hook
 * waits for a fresh proposal priced for that digit + stake (the same
 * stale-quote guard pattern used by the entry-watcher bots) before firing.
 * Stat collection continues on the next window as soon as a round settles,
 * matching the XML's during_purchase behavior of never pausing collection
 * while a contract is live.
 */
export interface FrequencyAutomationSettings {
  /** Minimum occurrences the leading digit must reach, while also being
   * the sole leader (no tie), before it's trusted enough to fire. Lower =
   * fires sooner on thinner evidence. Higher = waits for a clearer signal.
   * Confirmed default: 3. */
  minLeadCount: number;
  /** Hard cap on rounds placed before the run stops on its own. XML default: 5. */
  maxRounds: number;
  /** Stake multiplier applied for boostRounds after a loss at the base stake. XML default: 4. */
  boostMultiplier: number;
  /** How many rounds (after the one that just lost) stay elevated before resetting to base. XML default: 2. */
  boostRounds: number;
  /** Stop once cumulative loss reaches this amount. Null = no limit. XML default: 60. */
  lossThreshold: number | null;
  /** Stop once cumulative profit reaches this amount. Null = no target. XML default: 5. */
  profitThreshold: number | null;
}

export const DEFAULT_FREQUENCY_SETTINGS: FrequencyAutomationSettings = {
  minLeadCount: 3,
  maxRounds: 5,
  boostMultiplier: 4,
  boostRounds: 2,
  lossThreshold: 60,
  profitThreshold: 5,
};

interface UseDigitFrequencyAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  /** Only DIGITMATCH / DIGITDIFF are supported. */
  contractMode: ContractMode;
  /** Live last-digit of the current tick, already computed elsewhere. */
  lastDigit: number | null;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  /** Stake field (string) and its setter — driven by this hook between rounds. */
  stake: string;
  setStake: (value: string) => void;
  /** Selected digit and its setter — driven by this hook, set to the predicted digit each window. */
  selectedDigit: number;
  setSelectedDigit: (digit: number) => void;
}

export interface UseDigitFrequencyAutomationReturn {
  isRunning: boolean;
  phase: FrequencyPhase;
  isValidSetup: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  lastResult: FrequencyResult | null;
  results: FrequencyResult[];
  lastError: string | null;
  statusMessage: string;
  settings: FrequencyAutomationSettings;
  setSettings: (settings: FrequencyAutomationSettings) => void;
  roundCount: number;
  netProfit: number;
  stopReason: string | null;
  /** Live tally of digit occurrences in the current, not-yet-complete stats window. Index = digit. */
  freqCounts: number[];
  /** How many ticks of the current window have been collected so far. */
  ticksCollected: number;
  /** The digit predicted by the most recently completed stats window, or null before the first one completes. */
  predictedDigit: number | null;
}

function emptyCounts(): number[] {
  return new Array(10).fill(0);
}

export function useDigitFrequencyAutomation({
  isConnected,
  isAuthenticated,
  contractMode,
  lastDigit,
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
}: UseDigitFrequencyAutomationParams): UseDigitFrequencyAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<FrequencyPhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<FrequencyResult | null>(null);
  const [results, setResults] = useState<FrequencyResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<FrequencyAutomationSettings>(DEFAULT_FREQUENCY_SETTINGS);
  const [roundCount, setRoundCount] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [freqCounts, setFreqCounts] = useState<number[]>(emptyCounts());
  const [ticksCollected, setTicksCollected] = useState(0);
  const [predictedDigit, setPredictedDigit] = useState<number | null>(null);

  const isRunningRef = useRef(false);
  const phaseRef = useRef<FrequencyPhase>('idle');
  const settingsRef = useRef<FrequencyAutomationSettings>(DEFAULT_FREQUENCY_SETTINGS);
  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const baseStakeRef = useRef(0);
  const currentStakeRef = useRef(0);
  // Mirrors the XML's BoostLeft — how many more rounds (after the one just
  // settled) should run at the elevated stake before dropping back to base.
  const boostRoundsLeftRef = useRef(0);
  const freqCountsRef = useRef<number[]>(emptyCounts());
  const tickCountRef = useRef(0);
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

  const setPhaseBoth = (next: FrequencyPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const start = useCallback(() => {
    const parsedStake = parseFloat(stake);
    const startingStake = Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : 0;

    hasFired.current = false;
    pendingContractId.current = null;
    isRunningRef.current = true;
    baseStakeRef.current = startingStake;
    currentStakeRef.current = startingStake;
    boostRoundsLeftRef.current = 0;
    freqCountsRef.current = emptyCounts();
    tickCountRef.current = 0;
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
    setStake(String(startingStake));
    setPhaseBoth('collecting');
    setIsRunning(true);
  }, [stake, setStake]);

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

  // COLLECT — tallies every incoming tick's last digit into the current
  // window regardless of phase (matches the XML's before_purchase /
  // during_purchase both counting), so stats keep building even while a
  // round is in flight. The window is UNBOUNDED: after every tick, this
  // checks whether exactly one digit is strictly ahead of every other
  // digit (no tie at the top) AND that digit's count has reached
  // settings.minLeadCount. Only then does it fire — however many ticks
  // that takes. If the top spot is tied, or the leader hasn't reached
  // minLeadCount yet, it keeps collecting and waits for the next tick.
  useEffect(() => {
    if (!isRunningRef.current) return;
    if (lastDigit === null) return;

    const counts = freqCountsRef.current.slice();
    counts[lastDigit] += 1;
    freqCountsRef.current = counts;
    tickCountRef.current += 1;
    setFreqCounts(counts);
    setTicksCollected(tickCountRef.current);

    // Find the leading digit and detect ties at the top in one pass.
    let bestDigit = 0;
    let bestCount = counts[0];
    let tieCount = 1;
    for (let d = 1; d < 10; d++) {
      if (counts[d] > bestCount) {
        bestDigit = d;
        bestCount = counts[d];
        tieCount = 1;
      } else if (counts[d] === bestCount) {
        tieCount += 1;
      }
    }

    const hasSingleLeader = tieCount === 1;
    const leaderReachedThreshold = bestCount >= settingsRef.current.minLeadCount;

    if (hasSingleLeader && leaderReachedThreshold) {
      freqCountsRef.current = emptyCounts();
      tickCountRef.current = 0;
      setFreqCounts(emptyCounts());
      setTicksCollected(0);
      setPredictedDigit(bestDigit);

      if (bestDigit !== selectedDigit) {
        staleProposalId.current = latestProposalRef.current?.id ?? null;
        setSelectedDigit(bestDigit);
      }

      if (phaseRef.current === 'collecting') {
        setPhaseBoth('ready');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDigit]);

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

  // SETTLE — mirrors after_purchase in the XML: round count, boost-stake
  // bookkeeping, then the three stop checks (max rounds / stop-loss /
  // take-profit), in that order.
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

    const result: FrequencyResult = {
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

    if (nextRoundCount >= settings.maxRounds) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Reached max rounds (${settings.maxRounds}).`);
      return;
    }

    if (settings.lossThreshold !== null && nextNet <= -settings.lossThreshold) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Stop-loss reached: ${nextNet.toFixed(2)} USD.`);
      return;
    }

    if (settings.profitThreshold !== null && nextNet >= settings.profitThreshold) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhaseBoth('idle');
      setStopReason(`Take-profit reached: +${nextNet.toFixed(2)} USD.`);
      return;
    }

    // Boost-stake bookkeeping — identical shape to the XML's BoostLeft
    // countdown: a loss at the base stake arms boostRounds elevated
    // rounds (flat, not compounding), which then count down to 0
    // regardless of win/loss before resetting to base on their own.
    let nextStake: number;
    if (boostRoundsLeftRef.current > 0) {
      boostRoundsLeftRef.current -= 1;
      nextStake = boostRoundsLeftRef.current > 0 ? baseStakeRef.current * settings.boostMultiplier : baseStakeRef.current;
    } else if (!won) {
      boostRoundsLeftRef.current = settings.boostRounds;
      nextStake = baseStakeRef.current * settings.boostMultiplier;
    } else {
      nextStake = baseStakeRef.current;
    }
    currentStakeRef.current = nextStake;
    setStake(String(nextStake));

    // Resume collecting for the next prediction window. If a full window
    // was already gathered while this round was in flight, tickCountRef
    // would have already flipped phase to 'ready' via the COLLECT effect —
    // in that case leave phase as-is instead of overwriting it.
    if (phaseRef.current !== 'ready') {
      setPhaseBoth('collecting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPositions, phase, roundCount, netProfit, settings, setStake, selectedDigit]);

  const activePosition =
    activeContractId !== null
      ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null)
      : null;

  const statusMessage = !isValidSetup
    ? 'This bot only supports Matches/Differs.'
    : phase === 'collecting'
    ? `Working — ${ticksCollected} tick${ticksCollected === 1 ? '' : 's'} collected, round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}.`
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
