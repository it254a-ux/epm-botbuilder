
import { useState, useRef, useEffect, useCallback } from 'react';
import type { BuyResult, ProposalInfo } from '@/external/deriv-core';
import type { OpenPosition } from '../lib/types';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

export type MatchDiffEntryPhase = 'idle' | 'watching' | 'entered' | 'settled';

export interface MatchDiffEntryResult {
  contractId: number;
  profit: number;
  won: boolean;
  /** The stake this specific round was placed at (base stake, or elevated after a loss). */
  stake: number;
  /** The digit this round actually watched for. Only meaningful for readouts —
   * the hook itself always drives off selectedDigit at fire time. */
  selectedDigit?: number;
}

/**
 * NEW — separate from the Over/Under entry watcher (use-digits-entry-automation.ts),
 * which is untouched by this file. Same core mechanics (stake rule, round
 * limits, stale-quote guard), adapted for Matches/Differs:
 *
 * - Trigger digit is the selected digit ITSELF (no ± 1 offset like Over/Under).
 * - Mode (Match vs Differ) is fixed for the whole run — only the digit moves.
 * - Digit shift mode (optional, "fixed" by default — no change to original
 *   behavior): controls how the watched digit moves between rounds.
 *     - "fixed"  — stays locked on the selected digit the whole run (original behavior).
 *     - "bounce" — steps by 1 every round (win or lose), 0 up to 9, then
 *                  reverses back down to 0, repeating (predictable pattern).
 *     - "random" — picks a fresh random digit (0–9) every round (win or
 *                  lose), independent of the previous digit, so there's no
 *                  detectable pattern to the sequence at all.
 */
export type DigitShiftMode = 'fixed' | 'bounce' | 'random';

export interface MatchDiffAutomationSettings {
  /**
   * Multiplier applied to the BASE stake once a loss happens at the base
   * stake (e.g. 10 = base stake × 10). That elevated stake is then held
   * flat — not compounding further — for exactly the next THREE rounds
   * (win or lose, no early exit), before automatically dropping back to
   * the base stake. There is no stop on consecutive losses; the
   * three-round streak always completes and resets on its own, and the
   * run keeps going toward its Rounds / Stop-loss / Profit target.
   */
  multiplier: number;
  /** Hard cap on the number of rounds a single run will place before stopping on its own, win or lose. */
  maxRounds: number;
  /** Stop the run once cumulative loss reaches this amount. Null = no limit. */
  lossThreshold: number | null;
  /** How the watched digit moves between rounds. See DigitShiftMode above. Defaults to 'fixed' — identical to original behavior. */
  digitShiftMode: DigitShiftMode;
}

export const DEFAULT_MATCH_DIFF_ENTRY_SETTINGS: MatchDiffAutomationSettings = {
  multiplier: 10,
  maxRounds: 5,
  lossThreshold: 10,
  digitShiftMode: 'fixed',
};

/** How many rounds the elevated stake is held for after a loss at the base stake, before auto-resetting to base. */
const ELEVATED_STAKE_ROUND_COUNT = 3;

interface UseDigitsMatchDiffEntryAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  /** Only DIGITMATCH / DIGITDIFF are supported — the watcher is a no-op for other modes. */
  contractMode: ContractMode;
  /** The digit currently selected in the manual controls — this IS the trigger digit, unlike Over/Under. */
  selectedDigit: number;
  /** Live last-digit of the current tick, already computed elsewhere. */
  lastDigit: number | null;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  /** Stake field (string) and its setter — read as the run's starting stake at Start, then driven by this hook as rounds progress. */
  stake: string;
  setStake: (value: string) => void;
  /**
   * Optional. Only required for Bounce Mode to work. Lets the hook move
   * the watched digit itself between rounds. If omitted, bounceMode is
   * silently ignored.
   */
  setSelectedDigit?: (digit: number) => void;
}

export interface UseDigitsMatchDiffEntryAutomationReturn {
  isRunning: boolean;
  phase: MatchDiffEntryPhase;
  /** The digit currently being watched for — identical to selectedDigit for this bot. */
  triggerDigit: number | null;
  isValidSetup: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  lastResult: MatchDiffEntryResult | null;
  /** Every round settled so far in the current (or most recently finished) run, in order — R1 first. Cleared on start(). */
  results: MatchDiffEntryResult[];
  lastError: string | null;
  statusMessage: string;
  settings: MatchDiffAutomationSettings;
  setSettings: (settings: MatchDiffAutomationSettings) => void;
  roundCount: number;
  netProfit: number;
  stopReason: string | null;
}

/** Steps a digit by 1 in the given direction, reversing direction at the 0/9 boundary instead of overshooting. */
function nextBounceDigit(current: number, direction: 1 | -1): { next: number; direction: 1 | -1 } {
  const candidate = current + direction;
  if (candidate > 9 || candidate < 0) {
    const reversed: 1 | -1 = direction === 1 ? -1 : 1;
    return { next: current + reversed, direction: reversed };
  }
  return { next: candidate, direction };
}

/** Picks a uniformly random digit 0–9. Used by 'random' shift mode. */
function randomDigit(): number {
  return Math.floor(Math.random() * 10);
}

export function useDigitsMatchDiffEntryAutomation({
  isConnected,
  isAuthenticated,
  contractMode,
  selectedDigit,
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
  setSelectedDigit,
}: UseDigitsMatchDiffEntryAutomationParams): UseDigitsMatchDiffEntryAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<MatchDiffEntryPhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<MatchDiffEntryResult | null>(null);
  const [results, setResults] = useState<MatchDiffEntryResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<MatchDiffAutomationSettings>(DEFAULT_MATCH_DIFF_ENTRY_SETTINGS);
  const [roundCount, setRoundCount] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);

  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const baseStakeRef = useRef(0);
  const currentStakeRef = useRef(0);
  // How many more rounds (after the one just settled) should run at the
  // elevated (base × multiplier) stake. Set to ELEVATED_STAKE_ROUND_COUNT
  // the instant a loss happens at the base stake; counts down each settle
  // regardless of win/loss until it hits 0, at which point the stake drops
  // back to base.
  const elevatedRoundsLeftRef = useRef(0);

  // Bounce Mode state — only used when settings.bounceMode is true.
  const bounceDirectionRef = useRef<1 | -1>(1);
  const latestProposalRef = useRef<ProposalInfo | null>(null);
  useEffect(() => {
    latestProposalRef.current = proposal;
  }, [proposal]);
  // Same stale-quote guard pattern as the Over/Under entry watcher: after
  // moving the digit, refuse to fire until a proposal with a NEW id comes
  // back, so the bot never buys against a quote priced for the old digit.
  const staleProposalId = useRef<string | null>(null);

  // Matches/Differs has no degenerate digit — 0 through 9 are all valid.
  const triggerDigit = selectedDigit;
  const isValidSetup = contractMode === 'DIGITMATCH' || contractMode === 'DIGITDIFF';

  const start = useCallback(() => {
    const parsedStake = parseFloat(stake);
    const startingStake = Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : 0;

    hasFired.current = false;
    pendingContractId.current = null;
    isRunningRef.current = true;
    baseStakeRef.current = startingStake;
    currentStakeRef.current = startingStake;
    staleProposalId.current = null;
    bounceDirectionRef.current = 1;
    elevatedRoundsLeftRef.current = 0;

    setActiveContractId(null);
    setLastResult(null);
    setResults([]);
    setLastError(null);
    setStopReason(null);
    setRoundCount(0);
    setNetProfit(0);
    setStake(String(startingStake));
    setPhase('watching');
    setIsRunning(true);
  }, [stake, setStake]);

  const stop = useCallback((reason?: string) => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (!hasFired.current) {
      setPhase('idle');
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

  // WATCH — fire the buy the instant the selected digit lands, once a
  // proposal is available whose price matches the intended stake AND whose
  // id isn't the one flagged stale by a digit move in Bounce Mode.
  useEffect(() => {
    if (!isRunning || phase !== 'watching') return;
    if (hasFired.current) return;
    if (!isValidSetup || triggerDigit === null) return;
    if (lastDigit === null || lastDigit !== triggerDigit) return;
    if (isBuying) return;
    if (!proposal) return;
    if (staleProposalId.current !== null && proposal.id === staleProposalId.current) return;
    if (Math.abs(proposal.askPrice - currentStakeRef.current) > 0.01) return;

    staleProposalId.current = null;
    hasFired.current = true;
    buyContract();
  }, [isRunning, phase, lastDigit, triggerDigit, isValidSetup, isBuying, proposal, buyContract]);

  useEffect(() => {
    if (!hasFired.current || phase !== 'watching' || !buyResult) return;
    pendingContractId.current = buyResult.contractId;
    setActiveContractId(buyResult.contractId);
    setPhase('entered');
    clearBuyResult();
  }, [buyResult, phase, clearBuyResult]);

  useEffect(() => {
    if (!hasFired.current || phase !== 'watching' || !buyError) return;
    hasFired.current = false;
    setLastError(buyError);
    clearBuyResult();
  }, [buyError, phase, clearBuyResult]);

  // SETTLE
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

    const result: MatchDiffEntryResult = { contractId, profit, won, stake: roundStake, selectedDigit };
    setLastResult(result);
    setResults((prev) => [...prev, result]);
    setRoundCount(nextRoundCount);
    setNetProfit(nextNet);
    pendingContractId.current = null;
    setActiveContractId(null);
    hasFired.current = false;

    if (!isRunningRef.current) {
      setPhase('idle');
      setIsRunning(false);
      return;
    }

    if (nextRoundCount >= settings.maxRounds) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhase('idle');
      setStopReason(`Reached max rounds (${settings.maxRounds}).`);
      return;
    }

    if (settings.lossThreshold !== null && nextNet <= -settings.lossThreshold) {
      isRunningRef.current = false;
      setIsRunning(false);
      setPhase('idle');
      setStopReason(`Stop-loss reached: ${nextNet.toFixed(2)} USD.`);
      return;
    }

    // Elevated-stake streak: a loss at the base stake triggers exactly
    // ELEVATED_STAKE_ROUND_COUNT (3) rounds at base × multiplier (win or
    // lose, no early exit, flat — not compounding), then it automatically
    // resets to the base stake. No stop on consecutive losses — the
    // streak always completes and resets on its own, and the run
    // continues toward Rounds / Stop-loss / Profit target.
    let nextStake: number;
    if (elevatedRoundsLeftRef.current > 0) {
      elevatedRoundsLeftRef.current -= 1;
      nextStake =
        elevatedRoundsLeftRef.current > 0 ? baseStakeRef.current * settings.multiplier : baseStakeRef.current;
    } else if (!won) {
      elevatedRoundsLeftRef.current = ELEVATED_STAKE_ROUND_COUNT;
      nextStake = baseStakeRef.current * settings.multiplier;
    } else {
      nextStake = baseStakeRef.current;
    }
    currentStakeRef.current = nextStake;
    setStake(String(nextStake));

    // Digit shift — moves the watched digit every round (win or lose) per
    // settings.digitShiftMode, and marks the current proposal stale so the
    // WATCH effect waits for a fresh quote for the new digit before firing
    // again. 'fixed' (default) does nothing — identical to original behavior.
    if (settings.digitShiftMode !== 'fixed' && setSelectedDigit) {
      let nextDigit: number;
      if (settings.digitShiftMode === 'random') {
        // Independent random pick each round — no detectable pattern. Can
        // land on the same digit as the round that just finished; that's
        // expected with true randomness, not a bug.
        nextDigit = randomDigit();
      } else {
        const { next, direction } = nextBounceDigit(selectedDigit, bounceDirectionRef.current);
        bounceDirectionRef.current = direction;
        nextDigit = next;
      }
      // Only wait for a fresh quote if the digit is actually DIFFERENT.
      // If Random Mode happens to repick the same digit, no new proposal
      // request ever gets sent (nothing about the trade params changed),
      // so its id would never change either — marking it stale in that
      // case would make the bot wait forever for a quote that never
      // arrives. This was the cause of the run hanging.
      if (nextDigit !== selectedDigit) {
        staleProposalId.current = latestProposalRef.current?.id ?? null;
        setSelectedDigit(nextDigit);
      }
    }

    setPhase('watching');
  }, [openPositions, phase, roundCount, netProfit, settings, setStake, selectedDigit, setSelectedDigit]);

  const activePosition =
    activeContractId !== null
      ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null)
      : null;

  const statusMessage = !isValidSetup
    ? 'Entry watching only supports Matches/Differs.'
    : phase === 'watching'
    ? `Watching — round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}${
        settings.digitShiftMode === 'bounce'
          ? ` (bounce: digit ${selectedDigit})`
          : settings.digitShiftMode === 'random'
          ? ` (random: digit ${selectedDigit})`
          : ''
      }.`
    : phase === 'entered'
    ? 'Trade placed — waiting for it to settle.'
    : 'Idle';

  return {
    isRunning,
    phase,
    triggerDigit,
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
  };
}
