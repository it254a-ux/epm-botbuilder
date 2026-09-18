import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { Switch } from '@/external/rise-fall-dtrader/components/ui/switch';
import { Label } from '@/external/rise-fall-dtrader/components/ui/label';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type {
  UseStreakReversalAutomationReturn,
  StakeRule,
} from '@/external/rise-fall-dtrader/hooks/use-streak-reversal-automation';
import type { Direction } from '@/external/rise-fall-dtrader/lib/types';

interface StreakReversalAutomatedPanelProps {
  direction: Direction;
  allowEquals: boolean;
  onAllowEqualsChange: (value: boolean) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseStreakReversalAutomationReturn;
}

const STRATEGY_OPTIONS: { value: StakeRule; label: string }[] = [
  { value: 'martingale', label: 'Martingale' },
  { value: 'dalembert', label: "D'Alembert" },
];

/**
 * Fourth Rise/Fall automation option, alongside the plain direction-
 * fixed Martingale/D'Alembert panel (automated-panel.tsx). Direction is
 * NOT picked here — it's set automatically by the streak detector in
 * use-streak-reversal-automation.ts, so the Rise/Fall toggle is shown
 * read-only (reflects the currently confirmed direction, or "Watching…"
 * before a streak has formed) instead of being a control.
 *
 * All numeric settings editable, defaulting to the values already
 * validated on the DBot version of this strategy: streak length 5,
 * base stake 10, multiplier 2, take-profit 40, max 7 consecutive losses.
 */
export function StreakReversalAutomatedPanel({
  direction,
  allowEquals,
  onAllowEqualsChange,
  isConnected,
  isAuthenticated,
  automation,
}: StreakReversalAutomatedPanelProps) {
  const {
    isRunning,
    phase,
    start,
    stop,
    activePosition,
    results,
    statusMessage,
    settings,
    setSettings,
    netProfit,
    lossRunCount,
    currentStake,
    stopReason,
    windowTicks,
  } = automation;

  const canStart = isConnected && isAuthenticated && !isRunning && settings.baseStake > 0;
  const isMartingale = settings.stakeRule === 'martingale';

  return (
    <div className="w-full max-w-none mx-0 space-y-2 lg:space-y-2.5">
      {/* Read-only direction readout — set automatically by the streak detector. */}
      <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5">
        <p className="text-[9px] text-muted-foreground">Direction (auto)</p>
        <p className="text-[12px] font-medium text-foreground">
          {phase === 'collecting' || phase === 'idle' ? (
            <span className="text-muted-foreground">Watching for streak…</span>
          ) : (
            <span className={direction === 'CALL' ? 'font-bold text-green-600' : 'font-bold text-destructive'}>
              {direction === 'CALL' ? 'Rise' : 'Fall'} (reversal bet)
            </span>
          )}
        </p>
      </div>

      {/* Live streak window */}
      <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-muted-foreground">Streak window</p>
          <p className="text-[9px] tabular-nums text-muted-foreground">
            {windowTicks.length}/{settings.streakLength} ticks
          </p>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: Math.max(settings.streakLength - 1, 1) }).map((_, i) => {
            let cls = 'bg-muted';
            if (i < windowTicks.length - 1) {
              cls = windowTicks[i + 1] > windowTicks[i] ? 'bg-green-600' : windowTicks[i + 1] < windowTicks[i] ? 'bg-destructive' : 'bg-muted';
            }
            return <div key={i} className={`h-2 flex-1 rounded-sm ${cls}`} />;
          })}
        </div>
      </div>

      <NumberField
        label="Streak length (consecutive ticks)"
        value={settings.streakLength}
        onChange={(value) => setSettings({ ...settings, streakLength: Math.max(2, Math.round(value ?? 5)) })}
        disabled={isRunning}
        step={1}
      />

      <NumberField
        label="Initial stake"
        value={settings.baseStake}
        onChange={(value) => setSettings({ ...settings, baseStake: value ?? 0 })}
        suffix="USD"
        disabled={isRunning}
        step={0.01}
      />

      <div className="flex items-center justify-between">
        <Label htmlFor="allow-equals-streak" className="text-[10px] cursor-pointer">
          Allow equals
        </Label>
        <Switch
          id="allow-equals-streak"
          checked={allowEquals}
          disabled={isRunning}
          onCheckedChange={onAllowEqualsChange}
        />
      </div>

      <div className="space-y-0.5">
        <p className="text-[9px] text-muted-foreground">Strategy</p>
        <ToggleGroup
          type="single"
          value={settings.stakeRule}
          disabled={isRunning}
          onValueChange={(value) => {
            if (value) setSettings({ ...settings, stakeRule: value as StakeRule });
          }}
          className="w-full gap-0 rounded-full bg-muted p-0.5"
        >
          {STRATEGY_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              className="flex-1 h-6 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Stake multiplier"
          value={settings.multiplier}
          onChange={(value) => setSettings({ ...settings, multiplier: Math.max(1, value ?? 2) })}
          suffix="×"
          disabled={isRunning || !isMartingale}
          step={0.1}
        />
        <NumberField
          label="Stake increment"
          value={settings.increment}
          onChange={(value) => setSettings({ ...settings, increment: Math.max(0, value ?? 0) })}
          suffix="USD"
          disabled={isRunning || isMartingale}
          step={0.5}
        />
      </div>

      <NumberField
        label="Max stake"
        value={settings.maxStake ?? 0}
        onChange={(value) => setSettings({ ...settings, maxStake: value && value > 0 ? value : null })}
        suffix="USD"
        disabled={isRunning}
        step={1}
      />

      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Profit threshold"
          value={settings.profitThreshold ?? 0}
          onChange={(value) => setSettings({ ...settings, profitThreshold: value && value > 0 ? value : null })}
          suffix="USD"
          disabled={isRunning}
          step={1}
        />
        <NumberField
          label="Loss threshold"
          value={settings.lossThreshold ?? 0}
          onChange={(value) => setSettings({ ...settings, lossThreshold: value && value > 0 ? value : null })}
          suffix="USD"
          disabled={isRunning}
          step={1}
        />
      </div>

      <NumberField
        label="Max consecutive losses"
        value={settings.maxLossRuns ?? 0}
        onChange={(value) => setSettings({ ...settings, maxLossRuns: value && value > 0 ? Math.round(value) : null })}
        disabled={isRunning}
        step={1}
      />

      <div className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[9px] text-muted-foreground">
        {statusMessage}
      </div>

      <div>
        {isRunning ? (
          <Button variant="destructive" className="w-full h-7 text-[11px]" onClick={() => stop('Stopped manually')}>
            Stop
          </Button>
        ) : (
          <Button className="w-full h-7 text-[11px]" disabled={!canStart} onClick={start}>
            {!isAuthenticated ? 'Log in to trade' : !isConnected ? 'Connecting…' : 'Start Bot'}
          </Button>
        )}
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-2 py-1 space-y-0.5 text-[9px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net profit</span>
          <span className={`tabular-nums font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)} USD
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current stake</span>
          <span className="tabular-nums font-medium">{currentStake.toFixed(2)} USD</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Consecutive losses</span>
          <span className="tabular-nums font-medium">{lossRunCount}</span>
        </div>
      </div>

      {activePosition && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1 text-[9px] flex justify-between">
          <span className="text-blue-500">Trade placed — waiting to settle…</span>
          <span className="tabular-nums font-medium">{parseFloat(activePosition.bid_price).toFixed(2)} USD</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1 space-y-0 text-[9px] max-h-24 overflow-y-auto">
          <div className="flex justify-between items-center border-b border-border pb-0.5 sticky top-0 bg-muted/30">
            <span className="text-muted-foreground">RESULTS</span>
          </div>
          {results.map((result, index) => (
            <div key={result.contractId} className="flex justify-between leading-tight">
              <span className="text-muted-foreground">R{index + 1} ({result.direction === 'CALL' ? 'Rise' : 'Fall'})</span>
              <span className={`tabular-nums font-medium ${result.won ? 'text-green-600' : 'text-destructive'}`}>
                {result.won ? '+' : ''}{result.profit.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {stopReason && !isRunning && (
        <p className="text-[9px] text-muted-foreground rounded-md border border-border bg-muted/20 px-2 py-1">
          {stopReason}
        </p>
      )}
    </div>
  );
}
