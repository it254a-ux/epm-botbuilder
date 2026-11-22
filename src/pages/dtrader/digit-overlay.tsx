import { Component, useEffect, useState, type ReactNode } from 'react';
import { useDerivWS } from '@deriv/core';
import DigitStatsWidget from '@/pages/epm-analysis-tool/digit-stats-widget';
import { useEpmTickStore } from '@/pages/epm-analysis-tool/use-epm-tick-stats';
import { getShownSymbol, onShownSymbol } from './dtrader-symbol';

/** The live last-digit circles: follows the market on the Dtrader chart and redraws on every tick. */
export default function DigitOverlay() {
  const [symbol, setSymbol] = useState(getShownSymbol());
  useEffect(() => onShownSymbol(setSymbol), []);
  const { ws, isConnected } = useDerivWS();
  const store = useEpmTickStore(ws, isConnected, symbol);
  if (!symbol) return null;
  return <DigitStatsWidget store={store} singleRow />;
}

/** If anything inside the circles breaks, show a short note instead of failing silently. */
class Guard extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error) return <div style={{ color: '#ff6b6b', fontSize: 11 }}>digits error: {this.state.error}</div>;
    return this.props.children;
  }
}

export function DigitOverlayGuarded() {
  return (
    <Guard>
      <DigitOverlay />
    </Guard>
  );
}
