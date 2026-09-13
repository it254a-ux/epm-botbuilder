
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type {
  UseDigit3ConsecutiveAutomationReturn,
} from '@/external/rise-fall-dtrader/hooks/use-digit-3consecutive-automation';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

interface Digit3ConsecutiveAutomatedPanelProps {
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;
  stake: string;
  onStakeChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseDigit3ConsecutiveAutomationReturn;
}

const MODE_OPTIONS: { value: ContractMode; label: string }[] = [
  { value: 'DIGITMATCH', label: 'Matches' },
  { value: 'DIGITDIFF', label: 'Differs' },
];

const ROUND_OPTIONS = [3, 5, 10, 20, 50, 100];

/**
 * Fourth automation option for Matches/Differs (alongside Watcher,
 * Frequency, and the 2-in-a-row Consecutive bot). Same layout and field
 * set as digit-consecutive-automated-panel.tsx — Matches/Differs toggle,
 * Prediction box, live Status grid, Stake/Duration, Boost multiplier/
 * rounds, Stop-loss/Take-profit, Rounds, Start/Stop, results ledger.
 *
 * The only behavioral difference lives in the hook
 * (use-digit-3consecutive-automation.ts): the entrance rule is a rolling
 * "last 3 ticks all the same digit" check instead of "last 2 ticks", and
 * it keeps firing on every tick while the streak continues past 3 rather
 * than requiring a break first. See that file for the full rules.
 *
 * The Status grid's percentage math already generalizes to any streak
 * target — it just divides each digit's slot count by ticksCollected,
 * which this hook fixes at 3 (so 1/3 = 33%, 2/3 = 66%, 3/3 = 100%) —
 * so this component's JSX is otherwise unchanged from the 2-in-a-row
 * version.
 *
 * LAYOUT FIX: removed lg:max-w-[240px] so content stretches to fill the
 * full width of the parent Card, matching the Watcher panel — this
 * panel was previously stuck at a narrower fixed width than the card
 * actually gives it, forcing scrolling instead of filling the column.
 * No other spacing or font sizes changed.
 */
export function Digit3ConsecutiveAutomatedPanel({
  contractMode,
  onContractModeChange,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  isConnected,
  isAuthenticated,
  automation,
}: Digit3ConsecutiveAutomatedPanelProps) {
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

      {/* Live 3-slot percentage readout — current streak digit climbs
          33% -> 66% -> 100% as it extends toward 3-in-a-row, then fires.
          Container fill and inline percentage/digit labels match the
          2-in-a-row Consecutive bot's Status grid exactly. */}
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
          label="Boost multiplier"
          value={settings.boostMultiplier}
          onChange={(value) => setSettings({ ...settings, boostMultiplier: Math.max(1, value ?? 1) })}
          suffix="×"
          disabled={isRunning}
          step={0.5}
        />
        <NumberField
          label="Boost rounds"
          value={settings.boostRounds}
          onChange={(value) => setSettings({ ...settings, boostRounds: Math.max(0, Math.round(value ?? 0)) })}
          disabled={isRunning}
          step={1}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Stop-loss"
          value={settings.stopLoss}
          onChange={(value) => setSettings({ ...settings, stopLoss: Math.max(0, value ?? 0) })}
          suffix="USD"
          disabled={isRunning}
          step={0.5}
        />
        <NumberField
          label="Take-profit"
          value={settings.takeProfit}
          onChange={(value) => setSettings({ ...settings, takeProfit: Math.max(0, value ?? 0) })}
          suffix="USD"
          disabled={isRunning}
          step={0.5}
        />
      </div>

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
                R{index + 1}
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
