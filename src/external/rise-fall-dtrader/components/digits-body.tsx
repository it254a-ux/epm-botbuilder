
import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { useIsMobile } from '@/external/rise-fall-dtrader/hooks/use-is-mobile';
import { Skeleton } from '@/external/rise-fall-dtrader/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { DigitAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-automated-panel';
import { DigitEntryAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-entry-automated-panel';
import { DigitMatchDiffEntryAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-match-diff-entry-automated-panel';
import { DigitFrequencyAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-frequency-automated-panel';
import { DigitConsecutiveAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-consecutive-automated-panel';
import { Digit3ConsecutiveAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-3consecutive-automated-panel';
import { DigitTwinAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-twin-automated-panel';
import { DigitTrickerAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/digit-tricker-automated-panel';
import { DigitStatsBar } from '@/external/rise-fall-dtrader/components/custom/digit-stats-bar';
import { TradeBody } from '@/external/rise-fall-dtrader/components/trade-body';
import { useMartingaleAutomation } from '@/external/rise-fall-dtrader/hooks/use-martingale-automation';
import { useDigitsEntryAutomation } from '@/external/rise-fall-dtrader/hooks/use-digits-entry-automation';
import { useDigitsMatchDiffEntryAutomation } from '@/external/rise-fall-dtrader/hooks/use-digits-match-diff-entry-automation';
import { useDigitFrequencyAutomation } from '@/external/rise-fall-dtrader/hooks/use-digit-frequency-automation';
import { useDigitConsecutiveAutomation } from '@/external/rise-fall-dtrader/hooks/use-digit-consecutive-automation';
import { useDigit3ConsecutiveAutomation } from '@/external/rise-fall-dtrader/hooks/use-digit-3consecutive-automation';
import { useDigitTwinAutomation } from '@/external/rise-fall-dtrader/hooks/use-digit-twin-automation';
import { useDigitTrickerAutomation } from '@/external/rise-fall-dtrader/hooks/use-digit-tricker-automation';
import { useTrickerBackgroundScanner } from '@/external/rise-fall-dtrader/hooks/use-tricker-background-scanner';
import type { AuthState, ActiveSymbol, ProposalInfo, DurationLimits, BuyResult, DerivWS } from '@deriv/core';
import type { ContractMode, TradeType, DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';
import type { UseSmartChartsApiReturn } from '@/external/rise-fall-dtrader/hooks/use-smartcharts-api';
import type { SmartChartChartData } from '@/external/rise-fall-dtrader/hooks/use-smartchart-chart-data';
import type { OpenPosition } from '@/external/rise-fall-dtrader/lib/types';

const RiseFallChart = lazy(() => import('@/external/rise-fall-dtrader/components/rise-fall-chart').then(m => ({ default: m.RiseFallChart })));
const ChartFallback = () => (
  <div className="h-full w-full animate-pulse rounded-md border border-border/50 dark:border-white/[0.08] bg-muted/30" />
);

const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  'matches-differs': 'Matches/Differs',
  'over-under': 'Over/Under',
  'even-odd': 'Even/Odd',
};

/** Which Matches/Differs automated bot is active. Watcher = original
 * entry-watcher bot (fires instantly the moment the selected digit lands).
 * Frequency = predicts the digit off a rolling stats window (unique
 * leader + minimum lead count), boosts stake after a loss. Consecutive =
 * fires the instant any digit lands twice in a row, no window/lead
 * logic, flat stake, same feature set as Watcher otherwise.
 * ThreeConsecutive (tab label "Nova") = fires the instant any digit
 * lands three times in a row (rolling streak, resets to 0 the moment it
 * fires — see use-digit-3consecutive-automation.ts for full semantics),
 * same risk-management feature set as Consecutive (boost/SL/TP). Twin =
 * same 2-in-a-row entry trigger as Consecutive, then a self-contained
 * follow-up sequence with its own risk settings — see
 * use-digit-twin-automation.ts for the full mechanism. Tricker = same
 * entry-watcher mechanics as Watcher, but also rotates the traded symbol
 * through a fixed list of seven Volatility (1s) indices after every N
 * rounds (default 1) — see use-digit-tricker-automation.ts. Defaults to
 * Watcher — no change to existing behavior unless the user explicitly
 * switches. */
type MatchDiffBotType = 'watcher' | 'frequency' | 'consecutive' | 'three-consecutive' | 'twin' | 'tricker';

const MATCH_DIFF_BOT_OPTIONS: { value: MatchDiffBotType; label: string }[] = [
  { value: 'watcher', label: 'Watcher' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'consecutive', label: 'Consecutive' },
  { value: 'three-consecutive', label: 'Nova' },
  { value: 'twin', label: 'Twin' },
  { value: 'tricker', label: 'Tricker' },
];

export interface DigitsBodyProps {
  authState: AuthState;
  isConnected: boolean;
  isLoading: boolean;
  ws: DerivWS | null;
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  /**
   * NEW — the account's real tradable symbol list (digits.symbols from
   * useDigitsTrading). Optional; only consumed by Tricker, to filter its
   * volatility rotation down to symbols actually available on this
   * account/broker feed. No other bot uses this prop.
   */
  symbols?: ActiveSymbol[];
  digitStats: DigitStats;
  lastDigit: number | null;
  /**
   * BUGFIX — the current tick's epoch (unix timestamp). Passed straight
   * through to the Consecutive, Nova, and Twin bots so they can tell two
   * back-to-back ticks with the SAME digit apart (lastDigit alone
   * doesn't change in that case, so React would otherwise skip
   * re-running the detection effect). Twin also uses it to detect a
   * genuinely new tick between follow-up trades in its sequence.
   * Optional — every other bot on this page is unaffected either way.
   */
  lastTickEpoch?: number | null;
  tradeType: TradeType;
  setTradeType: (type: TradeType) => void;
  contractMode: ContractMode;
  setContractMode: (mode: ContractMode) => void;
  selectedDigit: number;
  setSelectedDigit: (digit: number) => void;
  stake: string;
  setStake: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  durationLimits: DurationLimits;
  proposal: ProposalInfo | null;
  isProposalLoading: boolean;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];

  // Chart data (mirrors RiseFallView's props, fed by the digits ws in page.tsx)
  chartData: SmartChartChartData | undefined;
  getQuotes: UseSmartChartsApiReturn['getQuotes'];
  subscribeQuotes: UseSmartChartsApiReturn['subscribeQuotes'];
  unsubscribeQuotes: UseSmartChartsApiReturn['unsubscribeQuotes'];

  // Trade type tabs (shared header owns the actual tab list; this lets a
  // selected bot — once digit bots exist — force the tab to match the bot).
  // Also passed down to TradeModeToggle to power the "Market contracts" menu.
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
}

/**
 * Manual trading (DigitTradePanel) and the Bot library have been removed
 * — Automated trading is now the only mode, so tradeMode/handleModeChange
 * and the manual branch below are gone. duration/setDuration/
 * durationLimits are still used here — the automated Over/Under and
 * Matches/Differs panels rely on them for the contract's expiry setting,
 * same as before. isProposalLoading remains in this component's props for
 * interface compatibility with page.tsx, but isn't consumed here (it was
 * only ever used by the now-removed manual panel).
 */
export function DigitsBody({
  ws,
  isConnected,
  isLoading,
  activeSymbol,
  selectSymbol,
  symbols,
  digitStats,
  lastDigit,
  lastTickEpoch,
  tradeType,
  contractMode,
  setContractMode,
  selectedDigit,
  setSelectedDigit,
  stake,
  setStake,
  duration,
  setDuration,
  durationLimits,
  proposal,
  buyContract,
  isBuying,
  buyResult,
  buyError,
  clearBuyResult,
  openPositions,
  chartData,
  getQuotes,
  subscribeQuotes,
  unsubscribeQuotes,
  activeTradeType,
  onSelectTradeType,
  authState,
}: DigitsBodyProps) {
  const [matchDiffBotType, setMatchDiffBotType] = useState<MatchDiffBotType>('watcher');
  const isAuthenticated = authState === 'authenticated';
  const isMobile = useIsMobile();

  // Martingale automation — used for Even/Odd only now, unchanged.
  const martingaleAutomation = useMartingaleAutomation({
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
  });

  // Entry-watcher automation — used only for Over/Under. Places no trade on
  // Start; arms and watches the digit stream, fires once the trigger digit
  // lands, then lets the contract settle on its own. Needs stake/setStake
  // itself (not just proposal/buyContract) because it drives the stake
  // between rounds — doubling once on a loss, resetting on a win.
  //
  // setContractMode/setSelectedDigit are passed in so that, when Hybrid
  // Mode is turned on in the panel, the hook can flip the barrier itself
  // between rounds. Off by default — no change to existing behavior unless
  // explicitly enabled.
  const overUnderAutomation = useDigitsEntryAutomation({
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
    setContractMode,
    setSelectedDigit,
  });

  // Entry-watcher automation for Matches/Differs ("Watcher" bot), completely
  // separate hook from the Over/Under one above (which is untouched).
  // Watches for the selected digit itself (no offset), with an optional
  // Bounce/Random Mode that moves the digit each round instead of staying
  // fixed.
  const matchDiffAutomation = useDigitsMatchDiffEntryAutomation({
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
  });

  // "Frequency" bot for Matches/Differs. Predicts the digit off a rolling
  // stats window instead of waiting for a specific digit to land, and
  // boosts stake for a fixed number of rounds after a loss.
  const frequencyAutomation = useDigitFrequencyAutomation({
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
  });

  // "Consecutive" bot for Matches/Differs. Fires the instant any
  // digit lands twice in a row; otherwise identical feature set to
  // Watcher (flat stake, Rounds cap, no boost/SL/TP). Selectable alongside
  // Watcher and Frequency via the toggle rendered below.
  //
  // BUGFIX: lastTickEpoch is now passed through so the hook can detect
  // back-to-back ticks landing on the same digit — see the prop's doc
  // comment above and the hook's own file header for why this was needed.
  const consecutiveAutomation = useDigitConsecutiveAutomation({
    isConnected,
    isAuthenticated,
    contractMode,
    lastDigit,
    tickEpoch: lastTickEpoch,
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
  });

  // "Nova" bot for Matches/Differs (internal hook/file name unchanged —
  // see use-digit-3consecutive-automation.ts). Fires the instant any
  // digit lands three times in a row (a rolling streak counter that
  // resets to 0 the moment it fires, rather than a fixed 3-tick
  // collection cycle — see that file for the full rules, including how
  // it keeps watching even while a previous contract is still open).
  // Same risk-management feature set as Consecutive (boost/SL/TP).
  const threeConsecutiveAutomation = useDigit3ConsecutiveAutomation({
    isConnected,
    isAuthenticated,
    contractMode,
    lastDigit,
    tickEpoch: lastTickEpoch,
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
  });

  // "Twin" bot for Matches/Differs. Same 2-in-a-row entry trigger as
  // Consecutive, then runs its own self-contained follow-up sequence with
  // its own Stop-loss/Take-profit/Rounds settings — see
  // use-digit-twin-automation.ts for the full mechanism. tickEpoch is
  // passed through both for the same back-to-back-tick bugfix as
  // Consecutive/Nova and because Twin also uses it to detect a fresh tick
  // between the trades in its sequence.
  const twinAutomation = useDigitTwinAutomation({
    isConnected,
    isAuthenticated,
    contractMode,
    lastDigit,
    tickEpoch: lastTickEpoch,
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
  });

  // Background scanner for Tricker — watches ticks on all 8 rotation
  // symbols concurrently (independent of whichever symbol is currently
  // charted) and ranks them by how rarely the selected digit repeats
  // immediately after landing. Enabled whenever the Tricker tab is open
  // (not just while running) so it has a head start collecting data
  // before the first slot switch needs a live pick.
  const trickerScanner = useTrickerBackgroundScanner({
    ws,
    isConnected,
    enabled: matchDiffBotType === 'tricker',
    symbols,
  });

  // "Tricker" bot for Matches/Differs — NEW. Same entry-watcher mechanics
  // as Watcher, plus symbol rotation through two alternating slots (odd
  // rounds / even rounds), each starting from a configurable symbol and
  // then picked live via trickerScanner.getBestDifferSymbol from each
  // slot's second turn onward. activeSymbol/selectSymbol/symbols/ws are
  // only ever passed to this hook and the scanner above — no other bot on
  // this page touches the traded symbol.
  const trickerAutomation = useDigitTrickerAutomation({
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
    availableSymbols: symbols,
    getBestDifferSymbol: trickerScanner.getBestDifferSymbol,
  });

  const isOverUnder = tradeType === 'over-under';
  const isMatchesDiffers = tradeType === 'matches-differs';

  // Switching bot type mid-run would leave the previous bot's automation
  // dangling in a running state with no visible controls, so stop it first.
  const handleMatchDiffBotTypeChange = (next: MatchDiffBotType) => {
    if (next === matchDiffBotType) return;
    if (matchDiffAutomation.isRunning) matchDiffAutomation.stop('Switched bot');
    if (frequencyAutomation.isRunning) frequencyAutomation.stop('Switched bot');
    if (consecutiveAutomation.isRunning) consecutiveAutomation.stop('Switched bot');
    if (threeConsecutiveAutomation.isRunning) threeConsecutiveAutomation.stop('Switched bot');
    if (twinAutomation.isRunning) twinAutomation.stop('Switched bot');
    if (trickerAutomation.isRunning) trickerAutomation.stop('Switched bot');
    setMatchDiffBotType(next);
  };

  // Buy purchase-result toasts — previously lived inside DigitTradePanel
  // alongside the Buy button; moved here with the button itself.
  useEffect(() => {
    if (buyError) {
      toast.error('Purchase Failed', { description: buyError });
      clearBuyResult();
    }
  }, [buyError, clearBuyResult]);

  useEffect(() => {
    if (buyResult) {
      toast.success('Contract Purchased', {
        description: `Buy price: ${buyResult.buyPrice.toFixed(2)} USD | Payout: ${buyResult.payout.toFixed(2)} USD | Balance: ${buyResult.balanceAfter.toFixed(2)} USD`,
      });
      clearBuyResult();
    }
  }, [buyResult, clearBuyResult]);

  /* MOBILE FIX: wrap chart in useMemo so it is NOT recreated on every tick.
     Previously the <RiseFallChart> JSX was rebuilt on every render (every
     150-300 ms on fast symbols), causing React to diff/remount the heavy
     SmartCharts canvas unnecessarily. useMemo keeps the exact same element
     reference until a real prop (symbol, chartData, isMobile) changes. */
  const chart = useMemo(() => {
    return chartData ? (
      <Suspense fallback={<ChartFallback />}>
        <RiseFallChart
          symbolKey="digits-chart"
          symbol={activeSymbol?.underlying_symbol}
          isConnectionOpened={isConnected}
          isMobile={isMobile}
          chartData={chartData}
          getQuotes={getQuotes}
          subscribeQuotes={subscribeQuotes}
          unsubscribeQuotes={unsubscribeQuotes}
          onSymbolChange={selectSymbol}
          contractsArray={[]}
        />
      </Suspense>
    ) : (
      <Skeleton className="h-full w-full rounded-md" />
    );
  }, [
    chartData,
    activeSymbol?.underlying_symbol,
    isConnected,
    isMobile,
    getQuotes,
    subscribeQuotes,
    unsubscribeQuotes,
    selectSymbol,
  ]);

  /* LAYOUT FIX: wrap the chart and DigitStatsBar together in a relative
     container so the stats bar floats at the bottom of the chart canvas
     (not at the bottom of the screen). The stats bar is now absolutely
     positioned inside this wrapper, sitting on top of the chart.

     BUGFIX: removed the standalone <DigitStatsBar /> that was rendered
     before <TradeBody> — it was causing a duplicate bar to appear on
     every digit tab (Matches/Differs, Over/Under, Even/Odd). Now only
     one bar exists, inside the chart wrapper. */
  const chartWithOverlay = (
    <div className="relative h-full w-full">
      {chart}
      <DigitStatsBar
        digitStats={digitStats}
        selectedDigit={selectedDigit}
        onDigitSelect={setSelectedDigit}
        lastDigit={lastDigit}
      />
    </div>
  );

  // Bot-type toggle — only shown for Matches/Differs, so Over/Under and
  // Even/Odd are unaffected.
  const matchDiffBotToggle = isMatchesDiffers && (
    <ToggleGroup
      type="single"
      value={matchDiffBotType}
      onValueChange={(value) => {
        if (value) handleMatchDiffBotTypeChange(value as MatchDiffBotType);
      }}
      className="w-full gap-0 rounded-full bg-muted p-0.5 lg:max-w-[320px]"
    >
      {MATCH_DIFF_BOT_OPTIONS.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          className="flex-1 h-6 rounded-full text-[8px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
        >
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <TradeBody
      chart={chartWithOverlay}
      isLoading={isLoading}
      label={TRADE_TYPE_LABELS[tradeType]}
      activeTradeType={activeTradeType}
      onSelectTradeType={onSelectTradeType}
      cardContentClassName="px-2 pt-4"
    >
      {isOverUnder ? (
        <DigitEntryAutomatedPanel
          contractMode={contractMode}
          onContractModeChange={setContractMode}
          digitStats={digitStats}
          lastDigit={lastDigit}
          selectedDigit={selectedDigit}
          onSelectedDigitChange={setSelectedDigit}
          stake={stake}
          onStakeChange={setStake}
          duration={duration}
          onDurationChange={setDuration}
          durationLimits={durationLimits}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated}
          automation={overUnderAutomation}
        />
      ) : isMatchesDiffers ? (
        <div className="w-full space-y-1.5 lg:space-y-2">
          {matchDiffBotToggle}
          {matchDiffBotType === 'watcher' ? (
            <DigitMatchDiffEntryAutomatedPanel
              contractMode={contractMode}
              onContractModeChange={setContractMode}
              digitStats={digitStats}
              lastDigit={lastDigit}
              selectedDigit={selectedDigit}
              onSelectedDigitChange={setSelectedDigit}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              onDurationChange={setDuration}
              durationLimits={durationLimits}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              automation={matchDiffAutomation}
            />
          ) : matchDiffBotType === 'frequency' ? (
            <DigitFrequencyAutomatedPanel
              contractMode={contractMode}
              onContractModeChange={setContractMode}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              onDurationChange={setDuration}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              automation={frequencyAutomation}
            />
          ) : matchDiffBotType === 'consecutive' ? (
            <DigitConsecutiveAutomatedPanel
              contractMode={contractMode}
              onContractModeChange={setContractMode}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              onDurationChange={setDuration}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              automation={consecutiveAutomation}
            />
          ) : matchDiffBotType === 'three-consecutive' ? (
            <Digit3ConsecutiveAutomatedPanel
              contractMode={contractMode}
              onContractModeChange={setContractMode}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              onDurationChange={setDuration}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              automation={threeConsecutiveAutomation}
            />
          ) : matchDiffBotType === 'twin' ? (
            <DigitTwinAutomatedPanel
              contractMode={contractMode}
              onContractModeChange={setContractMode}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              onDurationChange={setDuration}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              automation={twinAutomation}
            />
          ) : (
            <DigitTrickerAutomatedPanel
              contractMode={contractMode}
              onContractModeChange={setContractMode}
              digitStats={digitStats}
              lastDigit={lastDigit}
              selectedDigit={selectedDigit}
              onSelectedDigitChange={setSelectedDigit}
              stake={stake}
              onStakeChange={setStake}
              duration={duration}
              onDurationChange={setDuration}
              durationLimits={durationLimits}
              isConnected={isConnected}
              isAuthenticated={isAuthenticated}
              automation={trickerAutomation}
            />
          )}
        </div>
      ) : (
        <DigitAutomatedPanel
          tradeType={tradeType}
          contractMode={contractMode}
          onContractModeChange={setContractMode}
          digitStats={digitStats}
          lastDigit={lastDigit}
          selectedDigit={selectedDigit}
          onSelectedDigitChange={setSelectedDigit}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated}
          automation={martingaleAutomation}
        />
      )}
    </TradeBody>
  );
}
