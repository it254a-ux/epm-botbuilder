
import { useEffect, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/external/rise-fall-dtrader/components/ui/card';
import { Skeleton } from '@/external/rise-fall-dtrader/components/ui/skeleton';
import { AccumulatorAutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/accumulator-automated-panel';
import { TradeModeToggle } from '@/external/rise-fall-dtrader/components/custom/trade-mode-toggle';
import { useAccumulatorAutomation } from '@/external/rise-fall-dtrader/hooks/use-accumulator-automation';
import { useIsMobile } from '@/external/rise-fall-dtrader/hooks/use-is-mobile';
import { useContractMarkers } from '@/external/rise-fall-dtrader/hooks/use-contract-markers';
import type { ChartBarrier } from '@/external/rise-fall-dtrader/components/custom/smart-chart';
import type { ActiveSymbol, BuyResult, Tick } from '@/external/deriv-core';
import type { ApiWsHandle as DerivWS } from '@/external/rise-fall-dtrader/lib/api-ws-adapter';
import type { GrowthRate } from '@/external/rise-fall-dtrader/lib/accumulator-types';
import type { AccumulatorProposalInfo } from '@/external/rise-fall-dtrader/hooks/use-accumulator-proposal';
import type { UseSmartChartsApiReturn } from '@/external/rise-fall-dtrader/hooks/use-smartcharts-api';
import type { SmartChartChartData } from '@/external/rise-fall-dtrader/hooks/use-smartchart-chart-data';
import type { OpenPosition } from '@/external/rise-fall-dtrader/lib/types';

const AccumulatorChart = lazy(() =>
  import('@/external/rise-fall-dtrader/components/custom/accumulator-chart').then(m => ({ default: m.AccumulatorChart }))
);
const ChartFallback = () => (
  <div className="h-full w-full animate-pulse rounded-md border border-border/50 dark:border-white/[0.08] bg-muted/30" />
);

export interface AccumulatorsBodyProps {
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  growthRate: GrowthRate;
  setGrowthRate: (rate: GrowthRate) => void;
  growthRateOptions: { value: number; label: string }[];
  stake: string;
  setStake: (value: string) => void;
  takeProfit: string;
  setTakeProfit: (value: string) => void;
  proposal: AccumulatorProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  /** Live market tick stream — passed to the automation hook for tick counting. */
  currentTick: Tick | null;
  openPositions: OpenPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
  isAuthenticated: boolean;
  chartData: SmartChartChartData | undefined;
  getQuotes: UseSmartChartsApiReturn['getQuotes'];
  subscribeQuotes: UseSmartChartsApiReturn['subscribeQuotes'];
  unsubscribeQuotes: UseSmartChartsApiReturn['unsubscribeQuotes'];
  /** Currently selected trade type across the whole app (rise-fall,
   * accumulators, matches-differs, etc) and the setter for it — passed
   * down to TradeModeToggle so the "Market contracts" menu can switch tabs. */
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
}

/**
 * Manual trading (AccumulatorTradePanel + its own Buy/Close button) and
 * the Bot library have been removed — Automated trading is now the only
 * mode, so this always renders AccumulatorAutomatedPanel, which manages
 * its own buy/close via the automation hook.
 */
export function AccumulatorsBody({
  isConnected,
  isLoading,
  activeSymbol,
  selectSymbol,
  growthRate,
  setGrowthRate,
  growthRateOptions,
  stake,
  setStake,
  takeProfit,
  setTakeProfit,
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
  isAuthenticated,
  chartData,
  getQuotes,
  subscribeQuotes,
  unsubscribeQuotes,
  activeTradeType,
  onSelectTradeType,
}: AccumulatorsBodyProps) {
  const isMobile = useIsMobile();
  const contractMarkers = useContractMarkers(openPositions, activeSymbol?.underlying_symbol, isMobile);

  const automation = useAccumulatorAutomation({
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
  });

  // Buy/Close purchase-result toasts — previously lived inside
  // AccumulatorTradePanel alongside the Buy button; moved here with the
  // button itself so both stay together.
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

  const barrierColor = proposal?.hasCrossedBarrier ? '#cc2e3d' : '#008832';

  const chartBarriers: ChartBarrier[] =
    proposal?.highBarrier && proposal?.lowBarrier
      ? [
          {
            shade: 'BETWEEN',
            high: proposal.highBarrier,
            low: proposal.lowBarrier,
            relative: false,
            draggable: false,
            hideBarrierLine: false,
            hideOffscreenBarrier: true,
            hideOffscreenLine: true,
            hidePriceLabel: false,
            color: barrierColor,
            shadeColor: barrierColor,
          },
        ]
      : [];

  return (
    <div className="flex w-full flex-col px-3 py-2 sm:px-4 sm:py-4 gap-2 sm:gap-3 max-lg:pb-16 lg:pb-2 lg:px-3 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_240px] lg:gap-3 lg:h-full lg:min-h-0">
        <div className="flex flex-col gap-2 px-0 pt-2 lg:py-0 lg:h-full lg:min-h-0">
          <div
            className="lg:h-full lg:min-h-0"
            style={{
              height: isMobile ? 'calc(100dvh - 150px)' : undefined,
              touchAction: 'pan-y',
            }}
          >
            {chartData ? (
              <Suspense fallback={<ChartFallback />}>
                <AccumulatorChart
                  symbolKey="accumulator-chart"
                  symbol={activeSymbol?.underlying_symbol}
                  isConnectionOpened={isConnected}
                  isMobile={isMobile}
                  chartData={chartData}
                  getQuotes={getQuotes}
                  subscribeQuotes={subscribeQuotes}
                  unsubscribeQuotes={unsubscribeQuotes}
                  onSymbolChange={selectSymbol}
                  barriers={chartBarriers}
                  contractsArray={contractMarkers}
                />
              </Suspense>
            ) : (
              <Skeleton className="h-full w-full rounded-md" />
            )}
          </div>
        </div>

        {/* Trade panel — the Automated-trading badge and Market-contracts
            icon render inline at the top of the card via TradeModeToggle. */}
        <div className="flex flex-col gap-3 pt-3 lg:pt-0 border-t border-border lg:border-0 lg:h-full lg:min-h-0">
          {isLoading ? (
            <Skeleton className="lg:h-full h-48 w-full rounded-xl" />
          ) : (
            <Card className="lg:h-full lg:min-h-0 lg:overflow-y-auto">
              <CardContent className="pt-4">
                <TradeModeToggle
                  label="Accumulators"
                  activeTradeType={activeTradeType}
                  onSelectTradeType={onSelectTradeType}
                />

                <AccumulatorAutomatedPanel
                  growthRate={growthRate}
                  onGrowthRateChange={setGrowthRate}
                  growthRateOptions={growthRateOptions}
                  takeProfit={takeProfit}
                  onTakeProfitChange={setTakeProfit}
                  isConnected={isConnected}
                  isAuthenticated={isAuthenticated}
                  automation={automation}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
