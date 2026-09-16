
import { useState, useRef, useEffect, useCallback } from 'react';
import type { BuyResult, ProposalInfo, ActiveSymbol } from '@deriv/core';
import type { OpenPosition } from '../lib/types';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';
import { getSymbolDisplayName } from '@/external/rise-fall-dtrader/lib/active-symbols-display-names';

export type TrickerEntryPhase = 'idle' | 'watching' | 'entered' | 'settled';

export interface TrickerEntryResult {
  contractId: number;
  profit: number;
  won: boolean;
  stake: number;
  selectedDigit?: number;
  symbol?: string;
}

export type DigitShiftMode = 'fixed' | 'bounce' | 'random';

/**
 * Rotation list: Volatility 90, 25, 100, 75, 30, 50, 15, 10 — all "(1s)
 * Index" variants, in the order originally specified.
 */
export const TRICKER_ROTATION_SYMBOLS = [
  '1HZ90V',
  '1HZ25V',
  '1HZ100V',
  '1HZ75V',
  '1HZ30V',
  '1HZ50V',
  '1HZ15V',
  '1HZ10V',
] as const;

export type TrickerSlot = 'A' | 'B';

/**
 * ROTATION MODEL — two independent, alternating "slots":
 *
 *   - Slot A fires on odd rounds (1, 3, 5, 7…), Slot B on even rounds
 *     (2, 4, 6, 8…) — round 1 uses slot A's starting symbol, round 2
 *     uses slot B's, round 3 is slot A's NEXT pick, etc.
 *   - Each slot's STARTING symbol is fully configurable
 *     (settings.slotAStart / slotBStart) — not locked to a fixed
 *     position in the list.
 *   - From each slot's second turn onward, its next symbol is chosen
 *     LIVE: getBestDifferSymbol(selectedDigit) (from
 *     use-tricker-background-scanner.ts, which watches ticks on all 8
 *     rotation symbols in the background) picks whichever symbol
 *     currently has the lowest observed rate of the selected digit
 *     repeating immediately after it lands — the best odds for a Differ
 *     bet. If the scanner doesn't have enough background data yet for a
 *     fair comparison, that slot falls back to a simple bounce step
 *     (0→9→0-style, applied to the symbol list) so the bot never stalls
 *     waiting for data.
 */
export interface TrickerAutomationSettings {
  multiplier: number;
  maxRounds: number;
  lossThreshold: number | null;
  digitShiftMode: DigitShiftMode;
  /** How many consecutive rounds a slot stays active before alternating to the other slot. Default 1 — alternates every round. */
  roundsPerVolatility: number;
  /** Starting symbol for Slot A (odd-round turns). */
  slotAStart: string;
  /** Starting symbol for Slot B (even-round turns). */
  slotBStart: string;
}

export const DEFAULT_TRICKER_SETTINGS: TrickerAutomationSettings = {
  multiplier: 10,
  maxRounds: 5,
  lossThreshold: 10,
  digitShiftMode: 'fixed',
  roundsPerVolatility: 1,
  slotAStart: TRICKER_ROTATION_SYMBOLS[0],
  slotBStart: TRICKER_ROTATION_SYMBOLS[7],
};

const ELEVATED_STAKE_ROUND_COUNT = 3;

interface UseDigitTrickerAutomationParams {
  isConnected: boolean;
  isAuthenticated: boolean;
  contractMode: ContractMode;
  selectedDigit: number;
  lastDigit: number | null;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  stake: string;
  setStake: (value: string) => void;
  setSelectedDigit?: (digit: number) => void;
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  availableSymbols?: ActiveSymbol[];
  /**
   * From use-tricker-background-scanner.ts. Returns the rotation symbol
   * with the best (lowest) Differ repeat-rate for the given digit, or
   * null if not enough background data has been collected yet.
   */
  getBestDifferSymbol: (targetDigit: number) => string | null;
}

export interface UseDigitTrickerAutomationReturn {
  isRunning: boolean;
  phase: TrickerEntryPhase;
  triggerDigit: number | null;
  isValidSetup: boolean;
  start: () => void;
  stop: (reason?: string) => void;
  activePosition: OpenPosition | null;
  lastResult: TrickerEntryResult | null;
  results: TrickerEntryResult[];
  lastError: string | null;
  statusMessage: string;
  settings: TrickerAutomationSettings;
  setSettings: (settings: TrickerAutomationSettings) => void;
  roundCount: number;
  netProfit: number;
  stopReason: string | null;
  currentSymbol: string;
  currentSymbolDisplayName: string;
  /** Which slot is due to fire next round — for optional status display. */
  activeSlot: TrickerSlot;
}

/** Steps an index by 1 within [0, length-1], reversing direction at either boundary. Used as the no-data fallback only. */
function nextBounceIndex(current: number, direction: 1 | -1, length: number): { next: number; direction: 1 | -1 } {
  const candidate = current + direction;
  if (candidate > length - 1 || candidate < 0) {
    const reversed: 1 | -1 = direction === 1 ? -1 : 1;
    return { next: current + reversed, direction: reversed };
  }
  return { next: candidate, direction };
}

function nextBounceDigit(current: number, direction: 1 | -1): { next: number; direction: 1 | -1 } {
  const candidate = current + direction;
  if (candidate > 9 || candidate < 0) {
    const reversed: 1 | -1 = direction === 1 ? -1 : 1;
    return { next: current + reversed, direction: reversed };
  }
  return { next: candidate, direction };
}

function randomDigit(): number {
  return Math.floor(Math.random() * 10);
}

function indexOfSymbol(symbol: string): number {
  const idx = TRICKER_ROTATION_SYMBOLS.indexOf(symbol as (typeof TRICKER_ROTATION_SYMBOLS)[number]);
  return idx === -1 ? 0 : idx;
}

export function useDigitTrickerAutomation({
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
  activeSymbol,
  selectSymbol,
  getBestDifferSymbol,
}: UseDigitTrickerAutomationParams): UseDigitTrickerAutomationReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<TrickerEntryPhase>('idle');
  const [activeContractId, setActiveContractId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<TrickerEntryResult | null>(null);
  const [results, setResults] = useState<TrickerEntryResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<TrickerAutomationSettings>(DEFAULT_TRICKER_SETTINGS);
  const [roundCount, setRoundCount] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState<string>(DEFAULT_TRICKER_SETTINGS.slotAStart);
  const [activeSlot, setActiveSlot] = useState<TrickerSlot>('A');

  const hasFired = useRef(false);
  const pendingContractId = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const baseStakeRef = useRef(0);
  const currentStakeRef = useRef(0);
  const elevatedRoundsLeftRef = useRef(0);

  const bounceDirectionRef = useRef<1 | -1>(1);
  const latestProposalRef = useRef<ProposalInfo | null>(null);
  useEffect(() => {
    latestProposalRef.current = proposal;
  }, [proposal]);
  const staleProposalId = useRef<string | null>(null);

  // Per-slot state: current symbol for each slot, plus a fallback
  // bounce index/direction used only when the scanner has no data yet.
  const slotSymbolRef = useRef<Record<TrickerSlot, string>>({
    A: DEFAULT_TRICKER_SETTINGS.slotAStart,
    B: DEFAULT_TRICKER_SETTINGS.slotBStart,
  });
  const slotFallbackIndexRef = useRef<Record<TrickerSlot, number>>({ A: 0, B: 7 });
  const slotFallbackDirectionRef = useRef<Record<TrickerSlot, 1 | -1>>({ A: 1, B: -1 });
  const activeSlotRef = useRef<TrickerSlot>('A');
  const roundsOnVolatilityRef = useRef(0);

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

    // Reset both slots to their configured starting symbols.
    slotSymbolRef.current = { A: settings.slotAStart, B: settings.slotBStart };
    slotFallbackIndexRef.current = { A: indexOfSymbol(settings.slotAStart), B: indexOfSymbol(settings.slotBStart) };
    slotFallbackDirectionRef.current = { A: 1, B: -1 };
    activeSlotRef.current = 'A';
    setActiveSlot('A');
    roundsOnVolatilityRef.current = 0;

    const firstSymbol = settings.slotAStart;
    setCurrentSymbol(firstSymbol);
    if (activeSymbol?.underlying_symbol !== firstSymbol) {
      staleProposalId.current = latestProposalRef.current?.id ?? null;
      selectSymbol(firstSymbol);
    }

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
  }, [stake, setStake, activeSymbol, selectSymbol, settings.slotAStart, settings.slotBStart]);

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

  // WATCH
  useEffect(() => {
    if (!isRunning || phase !== 'watching') return;
    if (hasFired.current) return;
    if (!isValidSetup || triggerDigit === null) return;
    if (lastDigit === null || lastDigit !== triggerDigit) return;
    if (isBuying) return;
    if (!proposal) return;
    if (staleProposalId.current !== null && proposal.id === staleProposalId.current) return;
    if (Math.abs(proposal.askPrice - currentStakeRef.current) > 0.01) return;
    if (activeSymbol && activeSymbol.underlying_symbol !== currentSymbol) return;

    staleProposalId.current = null;
    hasFired.current = true;
    buyContract();
  }, [
    isRunning,
    phase,
    lastDigit,
    triggerDigit,
    isValidSetup,
    isBuying,
    proposal,
    buyContract,
    activeSymbol,
    currentSymbol,
  ]);

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

    const result: TrickerEntryResult = {
      contractId,
      profit,
      won,
      stake: roundStake,
      selectedDigit,
      symbol: currentSymbol,
    };
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

    // Elevated stake — identical rule to Watcher.
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

    // Digit shift — identical rule to Watcher's Mode (Hold/Swing/Flex).
    let digitChanged = false;
    let nextTriggerDigit = selectedDigit;
    if (settings.digitShiftMode !== 'fixed' && setSelectedDigit) {
      let nextDigit: number;
      if (settings.digitShiftMode === 'random') {
        nextDigit = randomDigit();
      } else {
        const { next, direction } = nextBounceDigit(selectedDigit, bounceDirectionRef.current);
        bounceDirectionRef.current = direction;
        nextDigit = next;
      }
      if (nextDigit !== selectedDigit) {
        digitChanged = true;
        nextTriggerDigit = nextDigit;
        setSelectedDigit(nextDigit);
      }
    }

    // Slot alternation — after every settings.roundsPerVolatility rounds
    // on the current slot, switch to the OTHER slot. That slot's next
    // symbol is picked live via getBestDifferSymbol (best Differ odds for
    // the current trigger digit), falling back to a simple bounce step
    // if the scanner doesn't have enough data yet.
    roundsOnVolatilityRef.current += 1;
    let symbolChanged = false;
    if (roundsOnVolatilityRef.current >= Math.max(1, settings.roundsPerVolatility)) {
      roundsOnVolatilityRef.current = 0;
      const nextSlot: TrickerSlot = activeSlotRef.current === 'A' ? 'B' : 'A';

      const ranked = getBestDifferSymbol(nextTriggerDigit);
      let nextSymbolForSlot: string;
      if (ranked) {
        nextSymbolForSlot = ranked;
        // Keep the fallback bounce pointer roughly in sync so, if data
        // dries up later, the fallback resumes from a sensible place.
        slotFallbackIndexRef.current[nextSlot] = indexOfSymbol(ranked);
      } else {
        const { next, direction } = nextBounceIndex(
          slotFallbackIndexRef.current[nextSlot],
          slotFallbackDirectionRef.current[nextSlot],
          TRICKER_ROTATION_SYMBOLS.length
        );
        slotFallbackIndexRef.current[nextSlot] = next;
        slotFallbackDirectionRef.current[nextSlot] = direction;
        nextSymbolForSlot = TRICKER_ROTATION_SYMBOLS[next];
      }

      slotSymbolRef.current[nextSlot] = nextSymbolForSlot;
      activeSlotRef.current = nextSlot;
      setActiveSlot(nextSlot);

      if (nextSymbolForSlot !== currentSymbol) {
        symbolChanged = true;
        setCurrentSymbol(nextSymbolForSlot);
        selectSymbol(nextSymbolForSlot);
      }
    }

    if (digitChanged || symbolChanged) {
      staleProposalId.current = latestProposalRef.current?.id ?? null;
    }

    setPhase('watching');
  }, [
    openPositions,
    phase,
    roundCount,
    netProfit,
    settings,
    setStake,
    selectedDigit,
    setSelectedDigit,
    currentSymbol,
    selectSymbol,
    getBestDifferSymbol,
  ]);

  const activePosition =
    activeContractId !== null ? (openPositions.find((p) => p.contract_id === activeContractId) ?? null) : null;

  const currentSymbolDisplayName = getSymbolDisplayName(currentSymbol);

  const statusMessage = !isValidSetup
    ? 'Entry watching only supports Matches/Differs.'
    : phase === 'watching'
    ? `Watching ${currentSymbolDisplayName} (slot ${activeSlot}) — round ${Math.min(roundCount + 1, settings.maxRounds)} of ${settings.maxRounds}.`
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
    currentSymbol,
    currentSymbolDisplayName,
    activeSlot,
  };
}
