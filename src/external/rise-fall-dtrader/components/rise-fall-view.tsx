
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/external/rise-fall-dtrader/components/ui/card';
import { Footer } from '@/external/rise-fall-dtrader/components/custom/footer';
import { Header } from '@/external/rise-fall-dtrader/components/custom/header';
import { Skeleton } from '@/external/rise-fall-dtrader/components/ui/skeleton';
import { useIsMobile } from '@/external/rise-fall-dtrader/hooks/use-is-mobile';
import { useContractMarkers } from '@/external/rise-fall-dtrader/hooks/use-contract-markers';
import { AutomatedPanel } from '@/external/rise-fall-dtrader/components/custom/automated-panel';
import { TradeModeToggle } from '@/external/rise-fall-dtrader/components/custom/trade-mode-toggle';
import { useMartingaleAutomation } from '../hooks/use-martingale-automation';
import type {
  AuthState,
  DerivAccount,
  ActiveSymbol,
  ProposalInfo,
  BuyResult,
  DerivWS,
} from '@deriv/core';
import type { Direction, DurationSelectUnit, DurationOption } from '../lib/types';
import type { UseSmartChartsApiReturn } from '@/external/rise-fall-dtrader/hooks/use-smartcharts-api';
import type { SmartChartChartData } from '@/external/rise-fall-dtrader/hooks/use-smartchart-chart-data';
import type { OpenPosition } from '../lib/types';

const RiseFallChart = dynamic(() => import('./rise-fall-chart').then(m => m.RiseFallChart), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-md border border-border/50 dark:border-white/[0.08] bg-muted/30" />
  ),
});

export interface RiseFallViewProps {
  authState: AuthState;
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  onLogin: () => Promise<void>;
  onSignUp: () => Promise<void>;
  onLogout: () => void;
  onSwitchAccount: (accountId: string) => Promise<void>;
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
  logoSrc?: string;
  appName?: string;
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
}

/**
 * Manual trading and the Bot library have been removed — Automated
 * trading is now the only mode, so this always renders AutomatedPanel.
 * duration/durationOptions/durationUnit/setDurationUnit/endDate/
 * setEndDate/endTime/setEndTime/ws/sellContract/sellingId remain in
 * props for interface compatibility with page.tsx, but are no longer
 * consumed here (they only fed the now-removed manual panel).
 */
export function RiseFallView({
  authState,
  accounts,
  activeAccount,
  onLogin,
  onSignUp,
  onLogout,
  onSwitchAccount,
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
  logoSrc,
  appName,
  activeTradeType,
  onSelectTradeType,
}: RiseFallViewProps) {
  const isMobile = useIsMobile();
  const contractMarkers = useContractMarkers(openPositions, activeSymbol?.underlying_symbol, isMobile);
  const isAuthenticated = authState === 'authenticated';

  const automation = useMartingaleAutomation({
    isConnected,
    isAuthenticated,
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

  // Buy purchase-result toasts — previously lived inside TradeControls
  // alongside the Buy button; moved here with the button itself, same
  // pattern as Accumulators and Digits.
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

  if (error) {
    return (
      <main className="flex flex-col bg-background items-center justify-center px-4 min-h-dvh">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main
      className="flex flex-col bg-background h-dvh overflow-hidden"
      style={{
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      <Header
        authState={authState}
        accounts={accounts}
        activeAccount={activeAccount}
        onLogin={onLogin}
        onSignUp={onSignUp}
        onLogout={onLogout}
        onSwitchAccount={onSwitchAccount}
        logoSrc={logoSrc}
        appName={appName}
        activeTradeType={activeTradeType}
        onSelectTradeType={onSelectTradeType}
      />
      <div className={authState === 'authenticated' ? 'h-[40px] shrink-0' : 'h-[36px] shrink-0'} />

      {/* Page content — fills all remaining viewport height and scrolls
          internally only if content overflows. Bottom padding on mobile
          reserves space so the footer never covers the last elements
          (e.g. "View your positions" link). */}
      <div className="flex w-full max-w-7xl mx-auto flex-col px-3 py-2 sm:px-4 sm:py-4 gap-4 sm:gap-3 max-lg:pb-8 lg:pb-2 flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-3 flex-1 min-h-0 lg:grid lg:grid-cols-[1fr_240px] lg:gap-4 lg:h-full">

          {/* Column 1: Chart — touch-action:pan-y lets vertical swipes scroll the page */}
          <div className="flex flex-col gap-2 px-0 pt-2 lg:py-0 flex-1 min-h-0 lg:h-full">
            <div
              className="flex-1 min-h-[420px] lg:h-full lg:min-h-[384px] overflow-hidden relative"
              style={{ touchAction: 'pan-y' }}
            >
              {chartData ? (
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
              ) : (
                <Skeleton className="h-full w-full rounded-md" />
              )}
            </div>
          </div>

          {/* Column 2: Trade controls — the Automated badge + Market
              contracts icon render inline at the top via TradeModeToggle. */}
          <div className="flex flex-col gap-3 pt-3 lg:pt-0 border-t border-border lg:border-0 lg:h-full lg:min-h-0">
            {isLoading ? (
              <Skeleton className="lg:h-full lg:min-h-[384px] h-48 w-full rounded-xl" />
            ) : (
              <Card className="lg:h-full lg:min-h-[384px] lg:overflow-y-auto">
                <CardContent className="px-3 pt-4 pb-6 lg:px-6">
                  <TradeModeToggle
                    activeTradeType={activeTradeType}
                    onSelectTradeType={onSelectTradeType}
                  />

                  <AutomatedPanel
                    direction={direction}
                    onDirectionChange={setDirection}
                    allowEquals={allowEquals}
                    onAllowEqualsChange={setAllowEquals}
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

      {/* Footer */}
      <div className="max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 py-1 text-center bg-background/80 backdrop-blur-sm lg:bg-transparent lg:static lg:py-0.5">
        <Footer />
      </div>
    </main>
  );
}
