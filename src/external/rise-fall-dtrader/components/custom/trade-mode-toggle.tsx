import { CompactSelect } from '@/external/rise-fall-dtrader/components/custom/compact-select';
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
const TYPES = [
  { label: 'Rise/Fall', value: 'rise-fall' },
  { label: 'Matches/Differs', value: 'matches-differs' },
  { label: 'Over/Under', value: 'over-under' },
  { label: 'Even/Odd', value: 'even-odd' },
  { label: 'Accumulators', value: 'accumulators' },
];

export function TradeModeToggle({ label = 'Rise/Fall', activeTradeType, onSelectTradeType }: TradeModeToggleProps) {
  return (
    <div className="mb-2">
      {onSelectTradeType ? (
        <CompactSelect
          label="Contract type"
          value={activeTradeType ?? 'rise-fall'}
          options={TYPES}
          onChange={onSelectTradeType}
        />
      ) : (
        <ModeRail activeTradeType={activeTradeType} onSelectTradeType={onSelectTradeType} />
      )}
    </div>
  );
}
