import { ModeRail } from '@/external/rise-fall-dtrader/components/custom/mode-rail';

interface TradeModeToggleProps {
  /** e.g. "Rise/Fall", "Matches/Differs" — rendered as "Automate {label}". Defaults to "Rise/Fall". */
  label?: string;
  /** Currently selected trade type — when provided (together with
   * onSelectTradeType), a "Market contracts" icon is added to the icon
   * row via ModeRail. See ModeRail for details. */
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
}

/**
 * Top of the trade panel card: the Automated-trading badge + Market
 * contracts icon row (via ModeRail), followed by the "Automate {label}"
 * label. Manual trading and the Bot library have been removed app-wide,
 * so this no longer toggles between modes — Automated trading is the
 * only mode, on every trade type.
 */
export function TradeModeToggle({ label = 'Rise/Fall', activeTradeType, onSelectTradeType }: TradeModeToggleProps) {
  return (
    <div className="mb-3">
      <ModeRail activeTradeType={activeTradeType} onSelectTradeType={onSelectTradeType} />
      <div className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
        Automate {label}
      </div>
    </div>
  );
}
