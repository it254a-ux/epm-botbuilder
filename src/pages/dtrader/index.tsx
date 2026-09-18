import { useState, useEffect } from 'react';
import { useSmartChartsApi } from '@/external/rise-fall-dtrader/hooks/use-smartcharts-api';
import { useSmartChartChartData } from '@/external/rise-fall-dtrader/hooks/use-smartchart-chart-data';
import { useRiseFallTrading } from '@/external/rise-fall-dtrader/hooks/use-rise-fall-trading';
import { useDigitsTrading } from '@/external/rise-fall-dtrader/hooks/use-digits-trading';
import { useAccumulatorTrading } from '@/external/rise-fall-dtrader/hooks/use-accumulator-trading';
import { useDerivWSContext } from '@/external/rise-fall-dtrader/components/custom/deriv-ws-provider';
import { RiseFallBody } from '@/external/rise-fall-dtrader/components/rise-fall-body';
import { DigitsBody } from '@/external/rise-fall-dtrader/components/digits-body';
import { AccumulatorsBody } from '@/external/rise-fall-dtrader/components/accumulators-body';
import { TemplateLayout } from '@/external/rise-fall-dtrader/components/custom/template-layout';
import '../../styles/dtrader-globals.css';

export default function DtraderPage() {
  return (
    <TemplateLayout>
      <div className="dtrader-app h-full">
        <RiseFallPage />
      </div>
    </TemplateLayout>
  );
}

function RiseFallPage() {
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const { authState, logout } = auth;
  const isAuthenticated = !!auth.wsUrl;

  const [activeTradeType, setActiveTradeType] = useState<string>('rise-fall');

  // Trade-type switching lives inside each Body's own "Market contracts"
  // menu (ModeRail, via TradeModeToggle/TradeBody) — no separate header
  // needed for it.

  // Which trade-type "family" is currently selected. Computed before the
  // trading hooks below so each hook can be told whether it's the active
  // one — this is what lets us skip loading data for modes the user hasn't
  // opened yet.
  const isDigitsTab =
    activeTradeType === 'matches-differs' ||
    activeTradeType === 'over-under' ||
    activeTradeType === 'even-odd';
  const isAccumulatorsTab = activeTradeType === 'accumulators';
  const isRiseFallTab = !isDigitsTab && !isAccumulatorsTab;

  // Once a mode has been activated (the user switched to it at least once
  // this session), it stays "warm" — we never flip it back off, so
  // switching away and back doesn't re-trigger a fresh load. Rise/Fall
  // starts warm since it's the default landing tab.
  const [activatedTabs, setActivatedTabs] = useState({
    riseFall: true,
    digits: false,
    accumulators: false,
  });

  useEffect(() => {
    setActivatedTabs((prev) => {
      if (isDigitsTab && !prev.digits) return { ...prev, digits: true };
      if (isAccumulatorsTab && !prev.accumulators) return { ...prev, accumulators: true };
      if (isRiseFallTab && !prev.riseFall) return { ...prev, riseFall: true };
      return prev;
    });
  }, [isDigitsTab, isAccumulatorsTab, isRiseFallTab]);

  const trading = useRiseFallTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated,
    onAuthWSFailed: logout,
    enabled: activatedTabs.riseFall,
  });
  /* MOBILE FIX: pass activatedTabs.riseFall so inactive tabs don't waste
     CPU fetching trading_times and transforming symbols for a chart that
     isn't mounted. Same pattern applied to digits and accumulators below. */
  const { chartData } = useSmartChartChartData(trading.ws, trading.isConnected, trading.symbols, activatedTabs.riseFall);
  const { getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartsApi(trading.ws);

  const digits = useDigitsTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated,
    onAuthWSFailed: logout,
    enabled: activatedTabs.digits,
  });
  const { chartData: digitsChartData } = useSmartChartChartData(digits.ws, digits.isConnected, digits.symbols, activatedTabs.digits);
  const {
    getQuotes: digitsGetQuotes,
    subscribeQuotes: digitsSubscribeQuotes,
    unsubscribeQuotes: digitsUnsubscribeQuotes,
  } = useSmartChartsApi(digits.ws);

  const accumulators = useAccumulatorTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated,
    onAuthWSFailed: logout,
    enabled: activatedTabs.accumulators,
  });
  const { chartData: accumulatorsChartData } = useSmartChartChartData(accumulators.ws, accumulators.isConnected, accumulators.symbols, activatedTabs.accumulators);
  const {
    getQuotes: accumulatorsGetQuotes,
    subscribeQuotes: accumulatorsSubscribeQuotes,
    unsubscribeQuotes: accumulatorsUnsubscribeQuotes,
  } = useSmartChartsApi(accumulators.ws);

  /* MOBILE FIX: the original code called digits.setTradeType() directly during
     render (a React anti-pattern that can cause infinite loops and extra work
     on mobile). Moved into useEffect so it only runs when dependencies actually
     change, and runs after paint instead of blocking it. */
  const { tradeType: digitsTradeType, setTradeType: setDigitsTradeType } = digits;
  useEffect(() => {
    if (isDigitsTab && digitsTradeType !== activeTradeType) {
      setDigitsTradeType(activeTradeType as typeof digitsTradeType);
    }
  }, [isDigitsTab, digitsTradeType, activeTradeType, setDigitsTradeType]);

  if (activeTradeType === 'accumulators') {
    return (
      <main
        className="flex flex-col bg-background max-lg:h-full max-lg:overflow-y-auto lg:h-full lg:overflow-hidden"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <AccumulatorsBody
          ws={accumulators.ws}
          isConnected={accumulators.isConnected}
          isLoading={accumulators.isLoading}
          activeSymbol={accumulators.activeSymbol}
          selectSymbol={accumulators.selectSymbol}
          growthRate={accumulators.growthRate}
          setGrowthRate={accumulators.setGrowthRate}
          growthRateOptions={accumulators.growthRateOptions}
          stake={accumulators.stake}
          setStake={accumulators.setStake}
          takeProfit={accumulators.takeProfit}
          setTakeProfit={accumulators.setTakeProfit}
          proposal={accumulators.proposal}
          buyContract={accumulators.buyContract}
          isBuying={accumulators.isBuying}
          buyResult={accumulators.buyResult}
          buyError={accumulators.buyError}
          clearBuyResult={accumulators.clearBuyResult}
          currentTick={accumulators.currentTick}
          openPositions={accumulators.openPositions}
          sellContract={accumulators.sellContract}
          sellingId={accumulators.sellingId}
          sellError={accumulators.sellError}
          clearSellError={accumulators.clearSellError}
          isAuthenticated={authState === 'authenticated'}
          chartData={accumulatorsChartData}
          getQuotes={accumulatorsGetQuotes}
          subscribeQuotes={accumulatorsSubscribeQuotes}
          unsubscribeQuotes={accumulatorsUnsubscribeQuotes}
          activeTradeType={activeTradeType}
          onSelectTradeType={setActiveTradeType}
        />
      </main>
    );
  }

  if (isDigitsTab) {
    return (
      <main
        className="flex flex-col bg-background max-lg:h-full max-lg:overflow-y-auto lg:h-full lg:overflow-hidden"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <DigitsBody
          authState={authState}
          isConnected={digits.isConnected}
          isLoading={digits.isLoading}
          ws={digits.ws}
          activeSymbol={digits.activeSymbol}
          selectSymbol={digits.selectSymbol}
          symbols={digits.symbols}
          digitStats={digits.digitStats}
          lastDigit={digits.lastDigit}
          lastTickEpoch={digits.currentTick?.epoch ?? null}
          tradeType={digits.tradeType}
          setTradeType={digits.setTradeType}
          contractMode={digits.contractMode}
          setContractMode={digits.setContractMode}
          selectedDigit={digits.selectedDigit}
          setSelectedDigit={digits.setSelectedDigit}
          stake={digits.stake}
          setStake={digits.setStake}
          duration={digits.duration}
          setDuration={digits.setDuration}
          durationLimits={digits.durationLimits}
          proposal={digits.proposal}
          isProposalLoading={digits.isProposalLoading}
          buyContract={digits.buyContract}
          isBuying={digits.isBuying}
          buyResult={digits.buyResult}
          buyError={digits.buyError}
          clearBuyResult={digits.clearBuyResult}
          openPositions={digits.openPositions}
          chartData={digitsChartData}
          getQuotes={digitsGetQuotes}
          subscribeQuotes={digitsSubscribeQuotes}
          unsubscribeQuotes={digitsUnsubscribeQuotes}
          activeTradeType={activeTradeType}
          onSelectTradeType={setActiveTradeType}
        />
      </main>
    );
  }

  return (
    <main
      className="flex flex-col bg-background max-lg:h-full max-lg:overflow-y-auto lg:h-full lg:overflow-hidden"
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
    >
      <RiseFallBody
        ws={trading.ws}
        isConnected={trading.isConnected}
        isLoading={trading.isLoading}
        error={trading.error}
        activeSymbol={trading.activeSymbol}
        selectSymbol={trading.selectSymbol}
        direction={trading.direction}
        setDirection={trading.setDirection}
        allowEquals={trading.allowEquals}
        setAllowEquals={trading.setAllowEquals}
        stake={trading.stake}
        onStakeChange={trading.setStake}
        duration={trading.duration}
        setDuration={trading.setDuration}
        durationOptions={trading.durationOptions}
        durationUnit={trading.durationUnit}
        setDurationUnit={trading.setDurationUnit}
        endDate={trading.endDate}
        setEndDate={trading.setEndDate}
        endTime={trading.endTime}
        setEndTime={trading.setEndTime}
        proposal={trading.proposal}
        buyContract={trading.buyContract}
        isBuying={trading.isBuying}
        buyResult={trading.buyResult}
        buyError={trading.buyError}
        clearBuyResult={trading.clearBuyResult}
        openPositions={trading.openPositions}
        sellContract={trading.sellContract}
        sellingId={trading.sellingId}
        chartData={chartData}
        getQuotes={getQuotes}
        subscribeQuotes={subscribeQuotes}
        unsubscribeQuotes={unsubscribeQuotes}
        isAuthenticated={authState === 'authenticated'}
        activeTradeType={activeTradeType}
        onSelectTradeType={setActiveTradeType}
        lastQuote={trading.currentTick?.quote ?? null}
        lastTickEpoch={trading.currentTick?.epoch ?? null}
      />
    </main>
  );
}
