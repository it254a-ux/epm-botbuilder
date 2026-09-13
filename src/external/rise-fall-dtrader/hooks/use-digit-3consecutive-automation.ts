
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult } from '@deriv/core';
import type { OpenPosition } from '../lib/types';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

export type ThreeConsecutivePhase = 'idle' | 'collecting' | 'entered';

export interface ThreeConsecutiveResult {
  contractId: number;
  profit: number;
  won: boolean;
  stake: number;
  predictedDigit: number;
}

/**
 * Fourth automation option for Matches/Differs, alongside Watcher
 * (use-digits-match-diff-entry-automation.ts), Frequency
 * (use-digit-frequency-automation.ts), and the 2-in-a-row Consecutive bot
 * (use-digit-consecutive-automation.ts) — none of which this file touches.
 *
 * Entrance strategy: watch for any digit ticking 3 times in a row. The
 * moment that happens, ARM a trade on that digit and immediately reset
 * the streak counter to zero, so watching for the NEXT 3-in-a-row starts
 * completely fresh from the very next tick — independent of whether a
 * trade actually executes yet.
 *
 *   - A tick equal to the previous tick extends the current streak.
 *   - A tick different from the previous tick breaks it — the streak
 *     restarts at 1 on the new digit.
 *   - The instant a streak reaches 3, it arms a trade on that digit AND
 *     resets to 0 right then — not after the trade fires, not after it
 *     settles. If the very next tick is a 4th matching digit, that tick
 *     only counts as 1 toward a brand-new streak; it does NOT re-fire on
 *     its own. Only a fresh 3-in-a-row (same digit repeating, or any
 *     other digit) arms the next trade.
 *
 * Detection keeps running even while a contract from a previous arm is
 * still open — the bot is always watching. However, only ONE contract is
 * ever open at a time: if a streak completes while the previous trade
 * hasn't settled yet, the new arm is held (and overwrites any earlier
 * unconsumed arm — only the most recent completed streak is kept) until
 * that contract settles, at which point the armed trade fires right
 * away.
 *
 *   Examples (E = trade fires on this tick):
 *     2, 2, 2(E)                      -> fires on the third 2
 *     2, 2, 2(E), 2                   -> that 4th 2 does NOT re-fire; it's
 *                                         just the first tick of a new streak
 *     2, 2, 2(E), 3, 4, 4, 4(E)       -> fires on the third 2, resets, then
 *                                         fires again on the third 4
 *     2, 2, 2(E, contract still open), 5, 5, 5 completes
 *                                      -> the 5-streak arms immediately in
 *                                         the background; the actual buy
 *                                         waits until the 2-contract settles
 *
 * The live Status display shows the CURRENT (post-reset) streak's
 * progress toward 3 — 33% / 66% / 100% — for whichever digit is actively
 * being counted right now, not the armed/pending trade.
 *
 * Risk management: identical boost-after-loss / stop-loss / take-profit
 * rule as the Frequency and 2-in-a-row Consecutive bots. A loss at the
 * base stake boosts the stake by `boostMultiplier` for the next
 * `boostRounds` rounds (win or lose), then automatically reverts to base.
 *
 * Architecture note: same async proposal/buyContract purchase flow as the
 * sibling Matches/Differs bots — once a trade is armed, this hook waits
 * for a fresh proposal priced for that digit + stake, AND for the
 * previous contract (if any) to have settled, before firing. Depends on
 * both `lastDigit` and `tickEpoch` in its tick-tracking effect so that
 * two ticks landing on the same digit back-to-back are never skipped by
 * React's dependency check (same pattern as the 2-in-a-row bot).
 */
export interface ThreeConsecutiveAutomationSettings {
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

export const DEFAULT_3CONSECUTIVE_SETTINGS: ThreeConsecutiveAutomationSettings = {
  maxRounds: 5,
  boostMultiplier: 4,
  boostRounds: 2,
  stopLoss: 0,
  takeProfit: 0,
};

interface UseDigit3ConsecutiveAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  contractMode: ContractMode;
  lastDigit: number | null;
  /** Tick change-detection signal — see file header note. Required for
   *  correct back-to-back-same-digit detection; if omitted, streaks of
   *  identical digits may be undercounted. */
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

export interface UseDigit3ConsecutiveAutomationReturn {
  isRunning: boolean;
  phase: ThreeConsecutivePhase;
  isValidSetup: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  lastResult: ThreeConsecutiveResult | null;
  results: ThreeConsecutiveResult[];
  lastError: string | null;
  statusMessage: string;
  settings: ThreeConsecutiveAutomationSettings;
  setSettings: (settings: ThreeConsecutiveAutomationSettings) => void;
  roundCount: number;
  netProfit: number;
  stopReason: string | null;
  /** Live 10-slot display: the digit currently being counted holds
   *  min(streakLength, 3) out of a fixed denominator of 3 (1 = 33%,
   *  2 = 66%, 3 = 100%, then immediately resets to 0 on completion).
   *  Every other digit's slot is 0. Index = digit. */
  freqCounts: number[];
  /** Fixed at 3 once the run has seen its first tick (denominator for the
   *  percentage display), 0 before that. */
  ticksCollected: number;
  /** The digit the CURRENT streak (post most-recent-reset) is counting,
   *  not necessarily an armed/pending trade digit. Null before the first tick. */
  predictedDigit: number | null;
  /** The digit armed to trade as soon as the previous contract (if any)
   *  settles, or null if nothing is currently armed. */
  armedDigit: number | null;
}

function emptyCounts(): number[] {
  return new Array(10).fill(0);
}

/** How many identical trailing ticks are required before arming a trade. */
const STREAK_TARGET = 3;

export function useDigit3ConsecutiveAutomation({
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
}: UseDigit3ConsecutiveAutomationParams): UseDigit3ConsecutiveAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<ThreeConsecutivePhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<ThreeConsecutiveResult | null>(null);
  const [results, setResults] = useState<ThreeConsecutiveResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ThreeConsecutiveAutomationSettings>(DEFAULT_3CONSECUTIVE_SETTINGS);
  const [roundCount, setRoundCount] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [freqCounts, setFreqCounts] = useState<number[]>(emptyCounts());
  const [ticksCollected, setTicksCollected] = useState(0);
  const [predictedDigit, setPredictedDigit] = useState<number | null>(null);
  const [armedDigit, setArmedDigit] = useState<number | null>(null);

  const isRunningRef = useRef(false);
  const phaseRef = useRef<ThreeConsecutivePhase>('idle');
  const settingsRef = useRef<ThreeConsecutiveAutomationSettings>(DEFAULT_3CONSECUTIVE_SETTINGS);
  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const currentStakeRef = useRef(0);
  const baseStakeRef = useRef(0);
  const boostRoundsLeftRef = useRef(0);
  // Current in-progress streak (post most-recent-reset). Resets to
  // null/0 the instant it hits STREAK_TARGET — see ARM below.
  const streakDigitRef = useRef<number | null>(null);
  const streakLenRef = useRef(0);
  // The digit armed to trade next, or null if nothing armed. Overwritten
  // (latest wins) if a new streak completes before this one is consumed.
  const armedDigitRef = useRef<number | null>(null);
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

  const setPhaseBoth = (next: ThreeConsecutivePhase) => {
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
    streakDigitRef.current = null;
    streakLenRef.current = 0;
    armedDigitRef.current = null;
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
    setArmedDigit(null);
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

  // TRACK — runs on every tick regardless of phase, so detection never
  // pauses just because a contract is open. Depends on both lastDigit
  // AND tickEpoch — lastDigit alone would not re-trigger this effect on
  // two back-to-back identical ticks, since React skips effects whose
  // dependency values are unchanged (Object.is).
  useEffect(() => {
    if (!isRunningRef.current) return;
    if (lastDigit === null) return;

    if (streakDigitRef.current === null || lastDigit !== streakDigitRef.current) {
      streakDigitRef.current = lastDigit;
      streakLenRef.current = 1;
    } else {
      streakLenRef.current += 1;
    }

    if (streakLenRef.current >= STREAK_TARGET) {
      // ARM — a fresh 3-in-a-row just completed. Record it as the trade
      // to fire next (overwriting any earlier unconsumed arm), then
      // reset the streak counter immediately so the NEXT 3-in-a-row is
      // counted completely fresh starting from the following tick,
      // whether or not this armed trade has fired/settled yet.
      armedDigitRef.current = lastDigit;
      setArmedDigit(lastDigit);
      streakDigitRef.current = null;
      streakLenRef.current = 0;

      setFreqCounts(emptyCounts());
      setTicksCollected(STREAK_TARGET);
      setPredictedDigit(null);

      if (lastDigit !== selectedDigit) {
        staleProposalId.current = latestProposalRef.current?.id ?? null;
        setSelectedDigit(lastDigit);
      }
    } else {
      const counts = emptyCounts();
      counts[lastDigit] = streakLenRef.current;
      setFreqCounts(counts);
      setTicksCollected(STREAK_TARGET);
      setPredictedDigit(lastDigit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDigit, tickEpoch]);

  // BUY — fires an armed trade once no contract is currently open and a
  // live proposal reflects the armed digit + intended stake. Detection
  // (the TRACK effect above) keeps running the whole time a contract is
  // open, so a new arm can already be waiting the instant this contract
  // settles.
  useEffect(() => {
    if (!isRunning) return;
    if (phase === 'entered') return; // previous contract still open — armed trade waits
    if (armedDigitRef.current === null) return;
    if (hasFired.current) return;
    if (isBuying) return;
    if (!proposal) return;
    if (staleProposalId.current !== null && proposal.id === staleProposalId.current) return;
    if (Math.abs(proposal.askPrice - currentStakeRef.current) > 0.01) return;

    staleProposalId.current = null;
    hasFired.current = true;
    buyContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase, proposal, isBuying, buyContract, armedDigit]);

  useEffect(() => {
    if (!hasFired.current || phase === 'entered' || !buyResult) return;
    pendingContractId.current = buyResult.contractId;
    setActiveContractId(buyResult.contractId);
    // The armed trade has now been placed — clear the arm so a repeat of
    // the same digit doesn't look armed again until a fresh streak forms.
    armedDigitRef.current = null;
    setArmedDigit(null);
    setPhaseBoth('entered');
    clearBuyResult();
  }, [buyResult, phase, clearBuyResult]);

  useEffect(() => {
    if (!hasFired.current || phase === 'entered' || !buyError) return;
    hasFired.current = false;
    setLastError(buyError);
    clearBuyResult();
  }, [buyError, phase, clearBuyResult]);

  // SETTLE — round count, boost-after-loss stake sizing, then the three
  // stop checks (max rounds, stop-loss, take-profit). Does not touch the
  // streak counter — it's been running continuously in the background
  // regardless of this contract's lifecycle. If a new arm formed while
  // this contract was open, the BUY effect fires it immediately once
  // phase returns to 'collecting'.
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

    const result: ThreeConsecutiveResult = {
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

    setPhaseBoth('collecting');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPositions, phase, roundCount, netProfit, selectedDigit, setStake]);

  const activePosition =
    activeContractId !== null
      ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null)
      : null;

  const statusMessage = !isValidSetup
    ? 'This bot only supports Matches/Differs.'
    : phase === 'entered' && armedDigit !== null
    ? `Armed on digit ${armedDigit} — waiting for the current contract to settle.`
    : phase === 'entered'
    ? 'Trade placed — waiting for it to settle.'
    : phase === 'collecting'
    ? `Working — round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}.`
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
    armedDigit,
  };
}
