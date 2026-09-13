
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type {
  UseDigitFrequencyAutomationReturn,
} from '@/external/rise-fall-dtrader/hooks/use-digit-frequency-automation';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

interface DigitFrequencyAutomatedPanelProps {
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;
  stake: string;
  onStakeChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseDigitFrequencyAutomationReturn;
}

const MODE_OPTIONS: { value: ContractMode; label: string }[] = [
  { value: 'DIGITMATCH', label: 'Matches' },
  { value: 'DIGITDIFF', label: 'Differs' },
];

const ROUND_OPTIONS = [3, 5, 10, 20, 50, 100];

/**
 * Second automation option for Matches/Differs, ported from the uploaded
 * DBot XML strategy (digit-frequency prediction + boost-after-loss
 * stake), then refined to fire only once one digit is BOTH strictly alone
 * in the lead (no tie) AND has reached "Minimum lead count" occurrences —
 * with no cap on how long the window can run while it waits for that.
 * Separate from, and does not alter, DigitMatchDiffEntryAutomatedPanel
 * (the "Watcher" bot) — see hooks/use-digit-frequency-automation.ts for the
 * full logic mapping back to the original XML and worked examples.
 *
 * LAYOUT: number-input settings are paired two-per-row (Stake+Duration,
 * Minimum lead count+Boost multiplier, Boost rounds+Stop-loss), with
 * Take-profit as the lone leftover full-width row, since 7 fields don't
 * divide evenly into pairs. This grid is unconditional (no breakpoint
 * prefix), so it applies identically on mobile and desktop — mobile
 * already has the full device width available here since this panel sits
 * below the chart there, not beside it. Rounds moved to sit immediately
 * above the idle/watching status readout, as the last setting before
 * Start/Stop. No trading logic, validation, or chart behavior changed.
 *
 * STATUS GRID: markup now matches the Consecutive/3-Streak bots' Status
 * grid exactly (fill-percentage-of-container with the percentage printed
 * inside the bar, idle/watching label) instead of the previous
 * height-relative-to-max-count bar style. Still driven by the same
 * freqCounts / ticksCollected / predictedDigit already returned by this
 * panel's hook — no new state was added anywhere.
 */
export function DigitFrequencyAutomatedPanel({
  contractMode,
  onContractModeChange,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  isConnected,
  isAuthenticated,
  automation,
}: DigitFrequencyAutomatedPanelProps) {
  const {
    isRunning,
    phase,
    isValidSetup,
    start,
    stop,
    activePosition,
    results,
    netProfit,
    lastError,
    statusMessage,
    settings,
    setSettings,
    freqCounts,
    ticksCollected,
    predictedDigit,
  } = automation;

  const stakeNum = parseFloat(stake);
  const canStart =
    isConnected && isAuthenticated && !isRunning && isValidSetup && !!stakeNum && stakeNum > 0;
  const isMatch = contractMode === 'DIGITMATCH';

  return (
    <div className="w-full space-y-1 lg:space-y-1">
      <ToggleGroup
        type="single"
        value={contractMode}
        disabled={isRunning}
        onValueChange={(value) => {
          if (value) onContractModeChange(value as ContractMode);
        }}
        className="w-full gap-0 rounded-full bg-muted p-0.5"
      >
        {MODE_OPTIONS.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="flex-1 h-6 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 space-y-0">
        <p className="text-[9px] text-muted-foreground">Prediction</p>
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-medium text-foreground">
            Last digit of the price will{' '}
            <span className={isMatch ? 'font-bold text-green-600 dark:text-green-400' : 'font-bold text-red-500'}>
              {isMatch ? 'match' : 'differ from'}
            </span>
          </p>
          <span
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
              isMatch ? 'bg-green-600' : 'bg-red-500'
            }`}
          >
            {predictedDigit ?? '–'}
          </span>
        </div>
      </div>

      {/* Live 10-slot percentage readout — same visual style as the
          Consecutive/3-Streak bots' Status grid. Each column's container
          fills from empty toward full exactly as its percentage grows,
          with the percentage shown inside the container itself and the
          digit number below it. */}
      <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 space-y-0.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-muted-foreground">Status</p>
          <p className="text-[9px] tabular-nums text-muted-foreground">
            {ticksCollected > 0 ? 'watching' : 'idle'}
          </p>
        </div>
        <div className="grid grid-cols-10 gap-0.5">
          {freqCounts.map((count, digit) => {
            const pct = ticksCollected > 0 ? Math.round((count / ticksCollected) * 100) : 0;
            return (
              <div key={digit} className="flex flex-col items-center gap-0.5">
                <div className="relative h-8 w-full rounded-sm bg-muted overflow-hidden">
                  <div
                    className={`absolute bottom-0 left-0 w-full transition-all duration-300 ${
                      digit === predictedDigit ? 'bg-primary' : 'bg-foreground/30'
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`text-[7px] font-bold tabular-nums ${
                        digit === predictedDigit ? 'text-primary-foreground' : 'text-foreground'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
                <span className="text-[7px] text-muted-foreground leading-none">{digit}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Number-input settings, paired two-per-row. Unconditional grid —
          same on mobile and desktop. */}
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Stake"
          value={stakeNum || 0}
          onChange={(value) => onStakeChange(String(value ?? 0))}
          suffix="USD"
          disabled={isRunning}
          step={0.01}
        />
        <NumberField
          label="Duration"
          value={duration}
          onChange={(value) => onDurationChange(Math.max(1, Math.round(value ?? 1)))}
          suffix="ticks"
          disabled={isRunning}
          step={1}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Minimum lead count"
          value={settings.minLeadCount}
          onChange={(value) => setSettings({ ...settings, minLeadCount: Math.max(2, Math.round(value ?? 3)) })}
          suffix="ticks"
          disabled={isRunning}
          step={1}
        />
        <NumberField
          label="Boost multiplier"
          value={settings.boostMultiplier}
          onChange={(value) => setSettings({ ...settings, boostMultiplier: Math.max(1, value ?? 4) })}
          suffix="×"
          disabled={isRunning}
          step={0.5}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Boost rounds"
          value={settings.boostRounds}
          onChange={(value) => setSettings({ ...settings, boostRounds: Math.max(1, Math.round(value ?? 2)) })}
          disabled={isRunning}
          step={1}
        />
        <NumberField
          label="Stop-loss"
          value={settings.lossThreshold ?? 0}
          onChange={(value) => setSettings({ ...settings, lossThreshold: value && value > 0 ? value : null })}
          suffix="USD"
          disabled={isRunning}
          step={1}
        />
      </div>

      <NumberField
        label="Take-profit"
        value={settings.profitThreshold ?? 0}
        onChange={(value) => setSettings({ ...settings, profitThreshold: value && value > 0 ? value : null })}
        suffix="USD"
        disabled={isRunning}
        step={1}
      />

      {/* Rounds — moved here, immediately above the status readout, as the
          last setting before Start/Stop. */}
      <div className="space-y-0.5">
        <p className="text-[9px] text-muted-foreground">Rounds</p>
        <ToggleGroup
          type="single"
          value={String(settings.maxRounds)}
          disabled={isRunning}
          onValueChange={(value) => {
            if (value) setSettings({ ...settings, maxRounds: Number(value) });
          }}
          className="w-full gap-0.5"
        >
          {ROUND_OPTIONS.map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="!w-5 !h-4 !min-w-0 !flex-none !px-0 rounded-md border border-border text-[9px] font-medium text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:font-bold hover:text-foreground"
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[9px]">
        {isValidSetup ? (
          <span className="text-muted-foreground">{statusMessage}</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">{statusMessage}</span>
        )}
      </div>

      <div>
        {isRunning || phase === 'entered' ? (
          <Button variant="destructive" className="w-full h-6 text-[10px]" onClick={() => stop('Stopped manually')}>
            Stop
          </Button>
        ) : (
          <Button className="w-full h-6 text-[10px]" disabled={!canStart} onClick={start}>
            {!isAuthenticated
              ? 'Log in to trade'
              : !isConnected
              ? 'Connecting…'
              : !isValidSetup
              ? 'Pick a valid mode'
              : `Start Bot (${settings.maxRounds} rounds)`}
          </Button>
        )}
      </div>

      {(isRunning || phase === 'entered') && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-0.5 space-y-0 text-[9px]">
          <p className="text-[9px] font-medium text-blue-500 dark:text-blue-400">
            {phase === 'entered' ? 'Trade placed — waiting to settle…' : 'Working…'}
          </p>
          {activePosition && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current value</span>
              <span className="tabular-nums font-medium">
                {parseFloat(activePosition.bid_price).toFixed(2)} USD
              </span>
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 space-y-0 text-[9px] max-h-24 overflow-y-auto">
          <div className="flex justify-between items-center border-b border-border pb-0.5 sticky top-0 bg-muted/30">
            <span className="text-muted-foreground">RESULTS</span>
            <span className={`tabular-nums font-bold ${netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {netProfit >= 0 ? '+' : ''}
              {netProfit.toFixed(2)} USD
            </span>
          </div>
          {results.map((result, index) => (
            <div key={result.contractId} className="flex justify-between leading-tight">
              <span className="text-muted-foreground">
                Digit {result.predictedDigit}
              </span>
              <span className={`tabular-nums font-medium ${result.won ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {result.won ? '+' : ''}
                {result.profit.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {lastError && !isRunning && phase !== 'entered' && (
        <p className="text-[9px] text-muted-foreground rounded-md border border-border bg-muted/20 px-2 py-0.5">
          {lastError}
        </p>
      )}
    </div>
  );
}
