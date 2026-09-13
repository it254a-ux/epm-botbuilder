
import { Label } from '@/external/rise-fall-dtrader/components/ui/label';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/external/rise-fall-dtrader/components/ui/select';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type { UseAccumulatorAutomationReturn } from '@/external/rise-fall-dtrader/hooks/use-accumulator-automation';
import type { GrowthRate } from '@/external/rise-fall-dtrader/lib/accumulator-types';

interface AccumulatorAutomatedPanelProps {
  growthRate: GrowthRate;
  onGrowthRateChange: (rate: GrowthRate) => void;
  growthRateOptions: { value: number; label: string }[];
  takeProfit: string;
  onTakeProfitChange: (value: string) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseAccumulatorAutomationReturn;
}

export function AccumulatorAutomatedPanel({
  growthRate,
  onGrowthRateChange,
  growthRateOptions,
  takeProfit,
  onTakeProfitChange,
  isConnected,
  isAuthenticated,
  automation,
}: AccumulatorAutomatedPanelProps) {
  const {
    settings,
    setSettings,
    isRunning,
    isClosing,
    start,
    stop,
    netProfit,
    tradeCount,
    stopReason,
    activePosition,
  } = automation;

  // Disabled while a previous contract is still being sold off — starting a
  // new round here would orphan that pending contract instead of tracking it.
  const canStart = isConnected && isAuthenticated && !isRunning && !isClosing;

  const updateSetting = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    setSettings({ ...settings, [key]: value });
  };

  const liveValue = activePosition ? parseFloat(activePosition.bid_price) : null;
  const liveProfit = liveValue !== null ? liveValue - settings.baseStake : null;

  const startLabel = isClosing
    ? 'Closing position…'
    : !isAuthenticated
    ? 'Log in to trade'
    : !isConnected
    ? 'Connecting…'
    : 'Start';

  return (
    <div className="w-full max-w-[200px] mx-auto space-y-1.5 lg:space-y-2">
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Growth rate</Label>
        <Select
          value={String(growthRate)}
          disabled={isRunning}
          onValueChange={(value) => onGrowthRateChange(parseFloat(value))}
        >
          <SelectTrigger className="h-7 text-xs px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {growthRateOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-0.5">
        <Label htmlFor="accu-auto-take-profit" className="text-[10px] text-muted-foreground">
          Take profit (per round)
        </Label>
        <input
          id="accu-auto-take-profit"
          type="number"
          value={takeProfit}
          disabled={isRunning}
          onChange={(e) => onTakeProfitChange(e.target.value)}
          onKeyDown={(e) => {
            if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
          }}
          min={0}
          step="0.01"
          placeholder="-"
          className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <NumberField
        label="Initial stake"
        value={settings.baseStake}
        onChange={(value) => updateSetting('baseStake', value ?? 1.5)}
        suffix="USD"
        disabled={isRunning}
        step={0.01}
      />
      <NumberField
        label="Ticks to hold"
        value={settings.ticksToHold}
        onChange={(value) => updateSetting('ticksToHold', Math.max(1, Math.round(value ?? 2)))}
        disabled={isRunning}
        step={1}
      />
      <NumberField
        label="Max trades"
        value={settings.maxTrades}
        onChange={(value) => updateSetting('maxTrades', Math.max(1, Math.round(value ?? 3)))}
        disabled={isRunning}
        step={1}
      />
      <NumberField
        label="Profit target"
        value={settings.targetProfit}
        onChange={(value) => updateSetting('targetProfit', value ?? 5)}
        suffix="USD"
        disabled={isRunning}
        step={0.01}
      />

      <div className="pt-0.5">
        {isRunning ? (
          <Button
            variant="destructive"
            className="w-full h-8 text-xs"
            onClick={() => stop('Stopped manually')}
          >
            Stop
          </Button>
        ) : (
          <Button className="w-full h-8 text-xs" disabled={!canStart} onClick={start}>
            {startLabel}
          </Button>
        )}
      </div>

      {/* Live contract card — visible while a contract is growing, and while
          it's being closed out after Stop, until settlement is confirmed. */}
      {(isRunning || isClosing) && activePosition && liveProfit !== null && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1 space-y-0.5 text-[10px]">
          <p className="text-[10px] font-medium text-blue-500 dark:text-blue-400 mb-0.5">
            {isClosing ? 'Closing contract…' : 'Contract running…'}
          </p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current value</span>
            <span className="tabular-nums font-medium">{liveValue!.toFixed(2)} USD</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Unrealized profit</span>
            <span className={`tabular-nums font-medium ${liveProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {liveProfit >= 0 ? '+' : ''}{liveProfit.toFixed(2)} USD
            </span>
          </div>
        </div>
      )}

      {/* Session stats — shown once at least one trade has completed */}
      {tradeCount > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1 space-y-0.5 text-[10px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trades completed</span>
            <span className="tabular-nums font-medium">{tradeCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net profit</span>
            <span className={`tabular-nums font-medium ${netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)} USD
            </span>
          </div>
        </div>
      )}

      {stopReason && !isRunning && !isClosing && (
        <p className="text-[10px] text-muted-foreground rounded-md border border-border bg-muted/20 px-2 py-1">
          {stopReason}
        </p>
      )}
    </div>
  );
}
