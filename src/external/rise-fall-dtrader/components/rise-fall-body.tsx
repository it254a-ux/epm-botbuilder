import { useEffect, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/external/rise-fall-dtrader/components/ui/card';
import { Skeleton } from '@/external/rise-fall-dtrader/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { useIsMobile } from '@/external/rise-fall-dtrader/hooks/use-is-mobile';
import { useContractMarkers } from '@/external/rise-fall-dtrader/hooks/use-contract-markers';
import { AutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/automated-panel';
import { StreakReversalAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/streak-reversal-automated-panel';
import { TradeBody } from './trade-body';
import { useMartingaleAutomation } from '../hooks/use-martingale-automation';
import { useStreakReversalAutomation } from '../hooks/use-streak-reversal-automation';
import type { ActiveSymbol, ProposalInfo, BuyResult, DerivWS } from '@deriv/core';
import type { Direction, DurationSelectUnit, DurationOption } from '../lib/types';
import type { UseSmartChartsApiReturn } from '@/external/rise-fall-dtrader/hooks/use-smartcharts-api';
import type { SmartChartChartData } from '@/external/rise-fall-dtrader/hooks/use-smartchart-chart-data';
import type { OpenPosition } from '../lib/types';

type EntryMode = 'fixed' | 'streak';

const RiseFallChart = lazy(() => import('./rise-fall-chart').then(m => ({ default: m.RiseFallChart })));
const ChartFallback = () => (
  <div className="h-full w-full animate-pulse rounded-md border border-border/50 dark:border-white/[0.08] bg-muted/30" />
);

export interface RiseFallBodyProps {
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  direction: Direction;
  setDirection: (direction: Direction) => void;
  allowEquals: boolean;
  setAllowEquals: (value: boolean) => void;
  stake: string;
  onStakeChange: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  durationOptions: DurationOption[];
  durationUnit: DurationSelectUnit;
  setDurationUnit: (unit: DurationSelectUnit) => void;
  endDate: Date | undefined;
  setEndDate: (date: Date | undefined) => void;
  endTime: string;
  setEndTime: (time: string) => void;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  chartData: SmartChartChartData | undefined;
  getQuotes: UseSmartChartsApiReturn['getQuotes'];
  subscribeQuotes: UseSmartChartsApiReturn['subscribeQuotes'];
  unsubscribeQuotes: UseSmartChartsApiReturn['unsubscribeQuotes'];
  isLive?: boolean;
  endEpoch?: number;
  isAuthenticated?: boolean;
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
  /** Live price feed for the streak-reversal entry mode — pass
   *  trading.currentTick.quote / .epoch from page.tsx, same pattern as
   *  DigitsBody's lastDigit/lastTickEpoch props. Optional so this
   *  component still works if the caller hasn't wired it up yet — the
   *  streak entry mode is simply unavailable (falls back to fixed-
   *  direction only) until it is. */
  lastQuote?: number | null;
  lastTickEpoch?: number | null;
}

/**
 * Manual trading and the Bot library have been removed — Automated
 * trading is now the only mode, so this always renders AutomatedPanel.
 *
 * NOTE: ws, duration, durationOptions, durationUnit, setDurationUnit,
 * endDate, setEndDate, endTime, setEndTime, sellContract, and sellingId
 * remain in this component's props for interface compatibility with its
 * parent (page.tsx) — they were only ever consumed by the now-removed
 * Manual trading panel (TradeControls) and Bot library, and are unused
 * here now. Flagging this in case you'd like the related state cleaned
 * up in page.tsx too, as a follow-up.
 */
export function RiseFallBody({
  isConnected,
  isLoading,
  error,
  activeSymbol,
  selectSymbol,
  direction,
  setDirection,
  allowEquals,
  setAllowEquals,
  stake,
  onStakeChange,
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
  isLive,
  endEpoch,
  isAuthenticated,
  activeTradeType,
  onSelectTradeType,
  lastQuote,
  lastTickEpoch,
}: RiseFallBodyProps) {
  const isMobile = useIsMobile();
  const contractMarkers = useContractMarkers(openPositions, activeSymbol?.underlying_symbol, isMobile);

  // Entry mode: 'fixed' is the original manual-direction Martingale/
  // D'Alembert panel; 'streak' is the new auto-direction streak-
  // reversal panel. Both hooks are always mounted (hooks can't be
  // called conditionally), but only the active mode's Start button can
  // actually be used — see canStart in each panel.
  const [entryMode, setEntryMode] = useState<EntryMode>('fixed');

  const fixedAutomation = useMartingaleAutomation({
    isConnected,
    isAuthenticated: !!isAuthenticated,
    stake,
    setStake: onStakeChange,
    proposal,
    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
    openPositions,
  });

  const streakAutomation = useStreakReversalAutomation({
    isConnected,
    isAuthenticated: !!isAuthenticated,
    lastQuote: lastQuote ?? null,
    lastTickEpoch,
    proposal,
    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
    openPositions,
    stake,
    setStake: onStakeChange,
    direction,
    setDirection,
  });

  // Buy purchase-result toasts — same pattern as Accumulators and Digits.
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

  // NOTE: previously this error state replaced the entire page (its own
  // full-screen <main>, no Header/Footer). Header/Footer now live in
  // page.tsx around every body component, same as Digits/Accumulators, so
  // this renders inside that shell instead of taking over the screen.
  // Flagging this in case you want the old full-screen behavior back.
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const chart = chartData ? (
    <Suspense fallback={<ChartFallback />}>
      <RiseFallChart
        symbolKey="rise-fall-chart"
        symbol={activeSymbol?.underlying_symbol}
        isConnectionOpened={isConnected}
        isMobile={isMobile}
        chartData={chartData}
        getQuotes={getQuotes}
        subscribeQuotes={subscribeQuotes}
        unsubscribeQuotes={unsubscribeQuotes}
        onSymbolChange={selectSymbol}
        isLive={isLive}
        endEpoch={endEpoch}
        contractsArray={contractMarkers}
      />
    </Suspense>
  ) : (
    <Skeleton className="h-full w-full rounded-md" />
  );

  return (
    <TradeBody
      chart={chart}
      isLoading={isLoading}
      activeTradeType={activeTradeType}
      onSelectTradeType={onSelectTradeType}
    >
      <div className="space-y-1.5 mb-2">
        <p className="text-[9px] text-muted-foreground">Entry mode</p>
        <ToggleGroup
          type="single"
          value={entryMode}
          disabled={fixedAutomation.isRunning || streakAutomation.isRunning}
          onValueChange={(value) => {
            if (value) setEntryMode(value as EntryMode);
          }}
          className="w-full gap-0 rounded-full bg-muted p-0.5"
        >
          <ToggleGroupItem
            value="fixed"
            className="flex-1 h-6 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
          >
            Fixed direction
          </ToggleGroupItem>
          <ToggleGroupItem
            value="streak"
            disabled={lastQuote === undefined}
            className="flex-1 h-6 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
          >
            Streak reversal
          </ToggleGroupItem>
        </ToggleGroup>
        {lastQuote === undefined && (
          <p className="text-[9px] text-muted-foreground">
            Streak reversal needs lastQuote/lastTickEpoch wired in from page.tsx (see RiseFallBodyProps).
          </p>
        )}
      </div>

      {entryMode === 'fixed' ? (
        <AutomatedPanel
          direction={direction}
          onDirectionChange={setDirection}
          allowEquals={allowEquals}
          onAllowEqualsChange={setAllowEquals}
          isConnected={isConnected}
          isAuthenticated={!!isAuthenticated}
          automation={fixedAutomation}
        />
      ) : (
        <StreakReversalAutomatedPanel
          direction={direction}
          allowEquals={allowEquals}
          onAllowEqualsChange={setAllowEquals}
          isConnected={isConnected}
          isAuthenticated={!!isAuthenticated}
          automation={streakAutomation}
        />
      )}
    </TradeBody>
  );
}
