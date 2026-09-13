import { Switch } from '@/external/rise-fall-dtrader/components/ui/switch';
import { Label } from '@/external/rise-fall-dtrader/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import type { Direction } from '@/external/rise-fall-dtrader/lib/types';
import type { UseMartingaleAutomationReturn } from '@/external/rise-fall-dtrader/hooks/use-martingale-automation';
import { AutomationControls, NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';

interface AutomatedPanelProps {
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
  allowEquals: boolean;
  onAllowEqualsChange: (value: boolean) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseMartingaleAutomationReturn;
}

/**
 * Automated Rise/Fall panel — strategy builder. Renders in place of the old
 * "Coming soon" placeholder when the mode rail is set to 'automated'.
 * Supports Martingale (stake multiplier) and D'Alembert (stake increment).
 * The Direction toggle, Initial stake field, and Allow equals switch are
 * Rise/Fall-specific; everything from the divider down is shared via
 * AutomationControls (see automation-controls.tsx).
 */
export function AutomatedPanel({
  direction,
  onDirectionChange,
  allowEquals,
  onAllowEqualsChange,
  isConnected,
  isAuthenticated,
  automation,
}: AutomatedPanelProps) {
  const { settings, setSettings, isRunning, start, stop, netProfit, tradeCount, currentStake, stopReason } = automation;

  const updateBaseStake = (value: number | null) => {
    setSettings({ ...settings, baseStake: value ?? 0 });
  };

  return (
    <div className="w-full max-w-none mx-0 space-y-2 lg:space-y-2.5">
      <ToggleGroup
        type="single"
        value={direction}
        disabled={isRunning}
        onValueChange={(value) => {
          if (value === 'CALL' || value === 'PUT') onDirectionChange(value);
        }}
        className="w-full gap-0 rounded-full bg-muted p-1"
      >
        <ToggleGroupItem
          value="CALL"
          className="flex-1 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-green-600 data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
        >
          Rise
        </ToggleGroupItem>
        <ToggleGroupItem
          value="PUT"
          className="flex-1 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-destructive data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
        >
          Fall
        </ToggleGroupItem>
      </ToggleGroup>

      <NumberField
        label="Initial stake"
        value={settings.baseStake}
        onChange={updateBaseStake}
        suffix="USD"
        disabled={isRunning}
        step={0.01}
      />

      <div className="flex items-center justify-between">
        <Label htmlFor="allow-equals-auto" className="text-[10px] cursor-pointer">
          Allow equals
        </Label>
        <Switch
          id="allow-equals-auto"
          checked={allowEquals}
          disabled={isRunning}
          onCheckedChange={onAllowEqualsChange}
        />
      </div>

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
