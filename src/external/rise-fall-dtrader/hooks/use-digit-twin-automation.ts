
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProposalInfo, BuyResult } from '@/external/deriv-core';
import type { OpenPosition } from '../lib/types';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

export type TwinPhase = 'idle' | 'collecting' | 'ready' | 'awaiting-tick' | 'entered';

export interface TwinResult {
  contractId: number;
  profit: number;
  won: boolean;
  stake: number;
  predictedDigit: number;
}

/**
 * Fifth automation option for Matches/Differs, alongside Watcher, Frequency,
 * Consecutive, and 3-Streak/Nova — none of which this file touches.
 *
 * Entrance trigger is identical to the Consecutive bot: the moment any
 * digit D lands twice in a row, this bot enters a 3-trade cycle on D. See
 * the COLLECT effect below, which is a direct copy of Consecutive's
 * detector (same "no window, no tie-break, only the immediately
 * preceding tick matters" rule), gated so it only runs while the cycle is
 * back at its starting step.
 *
 * The cycle itself (internal engineering note only — never surfaced in
 * any user-visible string in this file or the panel that renders it):
 *   Trade 1 fires instantly on the 2-in-a-row, Differ on D, at the base
 *   stake. If it wins, the cycle ends there and resets. If it loses,
 *   Trade 2 fires on the NEXT tick (not instantly) — Differ on D again —
 *   sized via the live payout ratio so that a win nets exactly half of
 *   Trade 1's lost stake. Regardless of Trade 2's outcome, Trade 3 fires
 *   on the tick after Trade 2 settles, same digit, sized the same way for
 *   the other half. After Trade 3 settles (win or lose), the cycle ends
 *   unconditionally — there is never a 4th trade — and the stake resets
 *   to base. Every fresh 2-in-a-row starts a fully independent cycle;
 *   Trades 2/3's targets are only ever computed from that cycle's own
 *   Trade 1 loss, never from a previous cycle's shortfall.
 *
 * Stake math for Trades 2/3: back-solved from the most recently available
 * proposal's payout ratio — ratio = (payout - askPrice) / askPrice — so
 * that a target profit P converts to a stake of P / ratio, rounded to 2
 * decimals. After computing it, the hook calls setStake(), marks the
 * current proposal id stale, and waits for a fresh proposal at that stake
 * before firing — the exact same guard the other four hooks already use.
 *
 * Waiting for "the next tick" (Trades 2 and 3 only, never Trade 1) is
 * implemented as its own phase, 'awaiting-tick': the settle effect
 * records the tick epoch at settle time, and a small effect watches for
 * tickEpoch to change away from that recorded value before flipping the
 * phase to 'ready', which is what lets the existing BUY effect fire.
 *
 * BUGFIX (double-tick / same-digit-in-a-row not detected): same as
 * Consecutive — the COLLECT effect below depends on both `lastDigit` and
 * `tickEpoch`, since React skips re-running an effect whose dependency
 * value hasn't changed (Object.is), and two consecutive ticks landing on
 * the same digit would otherwise never re-trigger it.
 *
 * Visible naming: nothing in statusMessage, or any other field a user can
 * see, ever describes this mechanism, the 2-in-a-row trigger, or the
 * recovery math. Wording mirrors the other bots' generic phrasing.
 */
export interface TwinAutomationSettings {
  /** Hard cap on total trades placed (all of Trade 1/2/3 count toward
   *  this) before the run stops on its own. */
  maxRounds: number;
  /** Cumulative loss (positive number, USD) at which the run stops
   *  itself early. 0 disables this check. */
  stopLoss: number;
  /** Cumulative profit (positive number, USD) at which the run stops
   *  itself early. 0 disables this check. */
  takeProfit: number;
}

export const DEFAULT_TWIN_SETTINGS: TwinAutomationSettings = {
  maxRounds: 15,
  stopLoss: 0,
  takeProfit: 0,
};

interface UseDigitTwinAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  contractMode: ContractMode;
  lastDigit: number | null;
  /**
   * Current tick's epoch (unix timestamp) — used both for the
   * same-digit-twice-in-a-row bugfix (see file header) and to detect
   * "the next tick" for Trades 2 and 3. Optional so a caller that hasn't
   * been updated yet doesn't break; without it, next-tick waits fire on
   * the following proposal update instead of a genuine new tick.
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

export interface UseDigitTwinAutomationReturn {
  isRunning: boolean;
  phase: TwinPhase;
  isValidSetup: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  lastResult: TwinResult | null;
  results: TwinResult[];
  lastError: string | null;
  statusMessage: string;
  settings: TwinAutomationSettings;
  setSettings: (settings: TwinAutomationSettings) => void;
  roundCount: number;
  netProfit: number;
  stopReason: string | null;
  /** Live 2-slot display, same semantics as Consecutive: the pending
   *  digit's slot is 1 (50%, waiting for a repeat) or 2 (100%, just
   *  matched) out of a fixed denominator of 2. Every other digit's slot
   *  is 0. Index = digit. */
  freqCounts: number[];
  /** Fixed at 2 once a cycle has started, 0 before the first tick of a
   *  fresh cycle. */
  ticksCollected: number;
  predictedDigit: number | null;
}

function emptyCounts(): number[] {
  return new Array(10).fill(0);
}

/** Internal-only step marker for where a cycle currently is. Never
 *  exposed on the return value or in any user-visible string. */
type CycleStep = 'A' | 'B' | 'C';

export function useDigitTwinAutomation({
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
}: UseDigitTwinAutomationParams): UseDigitTwinAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<TwinPhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<TwinResult | null>(null);
  const [results, setResults] = useState<TwinResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<TwinAutomationSettings>(DEFAULT_TWIN_SETTINGS);
  const [roundCount, setRoundCount] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [freqCounts, setFreqCounts] = useState<number[]>(emptyCounts());
  const [ticksCollected, setTicksCollected] = useState(0);
  const [predictedDigit, setPredictedDigit] = useState<number | null>(null);

  const isRunningRef = useRef(false);
  const phaseRef = useRef<TwinPhase>('idle');
  const settingsRef = useRef<TwinAutomationSettings>(DEFAULT_TWIN_SETTINGS);
  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const currentStakeRef = useRef(0);
  const baseStakeRef = useRef(0);
  // The digit currently "pending" for the initial 2-in-a-row trigger —
  // same meaning as Consecutive's. Only consulted while cycleStepRef is
  // 'A' and no cycle is in flight.
  const pendingDigitRef = useRef<number | null>(null);
  // Which trade within the current cycle we're on. Internal only.
  const cycleStepRef = useRef<CycleStep>('A');
  // Trade 1's lost stake amount for the in-flight cycle (0 when nothing
  // to recover). Trades 2 and 3's targets are both computed from this
  // single value, never from anything left over from an earlier cycle.
  const cycleLossRef = useRef(0);
  // Tick epoch recorded at the moment Trade 1 or Trade 2 settles, used to
  // detect that a genuinely new tick has arrived before firing the next
  // trade in the cycle.
  const settleTickEpochRef = useRef<number | null>(null);
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

  const setPhaseBoth = (next: TwinPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /** Back-solves a stake from the live payout ratio so that winning nets
   *  exactly `targetProfit`. Returns null if no usable proposal is
   *  available yet. */
  const computeStakeForProfit = useCallback((targetProfit: number): number | null => {
    const p = latestProposalRef.current;
    if (!p) return null;
    const ratio = (p.payout - p.askPrice) / p.askPrice;
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const rawStake = targetProfit / ratio;
    if (!Number.isFinite(rawStake) || rawStake <= 0) return null;
    return Math.round(rawStake * 100) / 100;
  }, []);

  const start = useCallback(() => {
    const parsedStake = parseFloat(stake);
    const startingStake = Number.isFinite(parsedStake) && parsedStake > 0 ? parsedStake : 0;

    hasFired.current = false;
    pendingContractId.current = null;
    isRunningRef.current = true;
    currentStakeRef.current = startingStake;
    baseStakeRef.current = startingStake;
    pendingDigitRef.current = null;
    cycleStepRef.current = 'A';
    cycleLossRef.current = 0;
    settleTickEpochRef.current = null;
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

  // COLLECT — identical detector to Consecutive's, gated so it only runs
  // while we're back at the start of a cycle (cycleStepRef === 'A'). Mid-
  // cycle (Trade 2/3 in flight) ticks are ignored here entirely — the
  // digit is already locked to D and a fresh 2-in-a-row elsewhere in the
  // stream must not interrupt an in-progress cycle.
  //
  // BUGFIX: depends on both lastDigit AND tickEpoch — see file header.
  useEffect(() => {
    if (!isRunningRef.current) return;
    if (cycleStepRef.current !== 'A') return;
    if (lastDigit === null) return;

    if (pendingDigitRef.current === null) {
      pendingDigitRef.current = lastDigit;
      const counts = emptyCounts();
      counts[lastDigit] = 1;
      setFreqCounts(counts);
      setTicksCollected(2);
      return;
    }

    if (lastDigit === pendingDigitRef.current) {
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
      pendingDigitRef.current = lastDigit;
      const counts = emptyCounts();
      counts[lastDigit] = 1;
      setFreqCounts(counts);
      setTicksCollected(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDigit, tickEpoch]);

  // AWAIT-TICK — Trades 2 and 3 don't fire the instant they're computed;
  // they wait for the next genuine tick. This effect watches for
  // tickEpoch to move past the value recorded when the previous trade in
  // the cycle settled, then flips to 'ready' so the BUY effect below can
  // pick it up exactly the same way it picks up Trade 1.
  useEffect(() => {
    if (phase !== 'awaiting-tick') return;
    if (!isRunningRef.current) return;
    if (settleTickEpochRef.current === null || tickEpoch === undefined || tickEpoch === null) {
      // No epoch info available to compare against — fall back to firing
      // as soon as a fresh proposal is ready rather than stalling forever.
      setPhaseBoth('ready');
      return;
    }
    if (tickEpoch !== settleTickEpochRef.current) {
      setPhaseBoth('ready');
    }
  }, [tickEpoch, phase]);

  // BUY — fires once a live proposal reflects the intended digit + stake.
  // Same guard shape as every other bot; doesn't need to know whether
  // it's firing Trade 1, 2, or 3.
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

  // SETTLE — records the round, then decides what happens next based on
  // cycleStepRef: continue the cycle (Trade 2 after a Trade 1 loss, Trade
  // 3 unconditionally after Trade 2) or close it out and reset to base.
  // Stop checks (max rounds, stop-loss, take-profit) are evaluated after
  // every trade, same as the sibling bots, and take priority over
  // continuing the cycle.
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
    const step = cycleStepRef.current;

    const result: TwinResult = {
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

    // Decide the cycle's next step before applying stop checks.
    let nextCycleStep: CycleStep | null = null; // null = close out the cycle
    let nextStake: number | null = null;

    if (step === 'A') {
      if (!won) {
        cycleLossRef.current = Math.abs(profit);
        const computed = computeStakeForProfit(cycleLossRef.current / 2);
        if (computed !== null) {
          nextCycleStep = 'B';
          nextStake = computed;
        }
      }
    } else if (step === 'B') {
      const computed = computeStakeForProfit(cycleLossRef.current / 2);
      if (computed !== null) {
        nextCycleStep = 'C';
        nextStake = computed;
      }
    }
    // step === 'C' always closes the cycle out — no 4th trade, ever.

    const { stopLoss, takeProfit, maxRounds } = settingsRef.current;
    let stopMessage: string | null = null;
    if (nextRoundCount >= maxRounds) {
      stopMessage = `Reached max rounds (${maxRounds}).`;
    } else if (stopLoss > 0 && nextNet <= -stopLoss) {
      stopMessage = `Stop-loss reached (down ${Math.abs(nextNet).toFixed(2)} USD).`;
    } else if (takeProfit > 0 && nextNet >= takeProfit) {
      stopMessage = `Take-profit reached (up ${nextNet.toFixed(2)} USD).`;
    }

    if (stopMessage) {
      isRunningRef.current = false;
      setIsRunning(false);
      cycleStepRef.current = 'A';
      currentStakeRef.current = baseStakeRef.current;
      setStake(String(baseStakeRef.current));
      setPhaseBoth('idle');
      setStopReason(stopMessage);
      return;
    }

    if (nextCycleStep === null) {
      // Cycle closed (Trade 1 won, or Trade 3 just settled either way, or
      // the stake math couldn't be computed) — reset fully and go back to
      // watching for a fresh trigger. No carry-forward of any kind.
      cycleStepRef.current = 'A';
      cycleLossRef.current = 0;
      currentStakeRef.current = baseStakeRef.current;
      setStake(String(baseStakeRef.current));
      pendingDigitRef.current = null;
      setFreqCounts(emptyCounts());
      setTicksCollected(0);
      setPredictedDigit(null);
      if (phaseRef.current !== 'ready') {
        setPhaseBoth('collecting');
      }
    } else {
      cycleStepRef.current = nextCycleStep;
      currentStakeRef.current = nextStake as number;
      setStake(String(nextStake));
      staleProposalId.current = latestProposalRef.current?.id ?? null;
      settleTickEpochRef.current = tickEpoch ?? null;
      setPhaseBoth('awaiting-tick');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPositions, phase, roundCount, netProfit, selectedDigit, setStake, tickEpoch, computeStakeForProfit]);

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
    : phase === 'awaiting-tick'
    ? `Working — round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}.`
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
