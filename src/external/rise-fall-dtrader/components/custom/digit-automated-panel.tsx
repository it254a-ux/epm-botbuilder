
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { AutomationControls, NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type { UseMartingaleAutomationReturn } from '@/external/rise-fall-dtrader/hooks/use-martingale-automation';
import type { ContractMode, TradeType, DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';

interface DigitAutomatedPanelProps {
  tradeType: TradeType;
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;
  digitStats: DigitStats;
  lastDigit: number | null;
  selectedDigit: number;
  onSelectedDigitChange: (digit: number) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseMartingaleAutomationReturn;
}

const CONTRACT_MODE_OPTIONS: Record<TradeType, { value: ContractMode; label: string }[]> = {
  'matches-differs': [
    { value: 'DIGITMATCH', label: 'Matches' },
    { value: 'DIGITDIFF', label: 'Differs' },
  ],
  'over-under': [
    { value: 'DIGITOVER', label: 'Over' },
    { value: 'DIGITUNDER', label: 'Under' },
  ],
  'even-odd': [
    { value: 'DIGITEVEN', label: 'Even' },
    { value: 'DIGITODD', label: 'Odd' },
  ],
};

function showDigitGrid(tradeType: TradeType): boolean {
  return true;
}

/**
 * Automated panel for digit contracts (Matches/Differs, Over/Under, Even/Odd).
 * The contract-mode toggle, digit-prediction rings, and Initial stake field are
 * digit-specific; everything from the divider down is the same
 * AutomationControls block used by Rise/Fall's AutomatedPanel.
 *
 * LAYOUT FIX: removed lg:max-w-[240px] so content stretches to fill the
 * full width of the parent Card, matching the left-edge alignment on the
 * right side too.
 *
 * BUGFIX: removed the <DigitStatsBar> from inside this panel. The stats
 * bar is now rendered once at the bottom of the chart (in digits-body.tsx)
 * for ALL digit tabs, so having it here too would create a duplicate on
 * the Even/Odd tab.
 */
export function DigitAutomatedPanel({
  tradeType,
  contractMode,
  onContractModeChange,
  selectedDigit,
  onSelectedDigitChange,
  isConnected,
  isAuthenticated,
  automation,
}: DigitAutomatedPanelProps) {
  const { settings, setSettings, isRunning, start, stop, netProfit, tradeCount, currentStake, stopReason } = automation;

  const updateBaseStake = (value: number | null) => {
    setSettings({ ...settings, baseStake: value ?? 0 });
  };

  const modeOptions = CONTRACT_MODE_OPTIONS[tradeType];

  return (
    <div className="w-full space-y-1.5 lg:space-y-2">
      <ToggleGroup
        type="single"
        value={contractMode}
        disabled={isRunning}
        onValueChange={(value) => {
          if (value) onContractModeChange(value as ContractMode);
        }}
        className="w-full gap-0 rounded-full bg-muted p-0.5"
      >
        {modeOptions.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="flex-1 h-6 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <NumberField
        label="Initial stake"
        value={settings.baseStake}
        onChange={updateBaseStake}
        suffix="USD"
        disabled={isRunning}
        step={0.01}
      />

      <AutomationControls
        settings={settings}
        setSettings={setSettings}
        isRunning={isRunning}
        start={start}
        stop={stop}
        netProfit={netProfit}
        tradeCount={tradeCount}
        currentStake={currentStake}
        stopReason={stopReason}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
