import { useEffect, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import DigitStatsWidget from '@/pages/epm-analysis-tool/digit-stats-widget';
import { useEpmTickStore } from '@/pages/epm-analysis-tool/use-epm-tick-stats';
import { getDtraderSymbol, onDtraderSymbol } from './dtrader-symbol';

/** The live last-digit circles: follows the market on the Dtrader chart and redraws on every tick. */
export default function DigitOverlay() {
  const [symbol, setSymbol] = useState(getDtraderSymbol());
  useEffect(() => onDtraderSymbol(setSymbol), []);
  const { ws, isConnected } = useDerivWS();
  const store = useEpmTickStore(ws, isConnected, symbol);
  if (!symbol) return null;
  return <DigitStatsWidget store={store} singleRow />;
}
