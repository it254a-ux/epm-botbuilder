
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type {
  UseDigitConsecutiveAutomationReturn,
} from '@/external/rise-fall-dtrader/hooks/use-digit-consecutive-automation';
import type { ContractMode } from '@/external/rise-fall-dtrader/lib/digit-types';

interface DigitConsecutiveAutomatedPanelProps {
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;
  stake: string;
  onStakeChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseDigitConsecutiveAutomationReturn;
}

const MODE_OPTIONS: { value: ContractMode; label: string }[] = [
  { value: 'DIGITMATCH', label: 'Matches' },
  { value: 'DIGITDIFF', label: 'Differs' },
];

const ROUND_OPTIONS = [3, 5, 10, 20, 50, 100];

/**
 * Third automation option for Matches/Differs (alongside Watcher and
 * Frequency). Carries the same feature set as the Watcher panel — Matches/
 * Differs toggle, Prediction box, Stake/Duration fields, Rounds,
 * Start/Stop, results ledger — plus the same risk-management fields as
 * the Frequency panel: Boost multiplier, Boost rounds, Stop-loss,
 * Take-profit. No digit-selection Mode selector (Watcher's Hold/Swing/
 * Flex), since this bot never pre-selects a digit to watch — see
 * hooks/use-digit-consecutive-automation.ts for the consecutive-match
 * entrance strategy this bot uses instead. No "Minimum lead count" field
 * either — that one is specific to Frequency's window/tie-break logic and
 * has no equivalent in Consecutive's "two-in-a-row" rule.
 *
 * Adds one thing Watcher doesn't have: a live 10-slot percentage display,
 * same visual style as the Frequency bot's Status grid — shows the
 * currently pending digit at 50% (seen once, waiting for a repeat),
 * jumping to 100% the instant it repeats and fires.
 *
 * LAYOUT: number-input settings paired two-per-row (Stake+Duration,
 * Boost multiplier+Boost rounds, Stop-loss+Take-profit) — 6 fields, 3
 * even pairs. Grid is unconditional (no breakpoint prefix), so it's the
 * same on mobile and desktop. Rounds moved to sit immediately above the
 * idle/watching status readout, as the last setting before Start/Stop.
 * No trading logic, validation, or chart behavior changed.
 *
 * LAYOUT FIX: removed lg:max-w-[240px] so content stretches to fill the
 * full width of the parent Card, matching the Watcher panel — this
 * panel was previously stuck at a narrower fixed width than the card
 * actually gives it, forcing scrolling instead of filling the column.
 * No other spacing or font sizes changed.
 */
export function DigitConsecutiveAutomatedPanel({
  contractMode,
  onContractModeChange,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  isConnected,
  isAuthenticated,
  automation,
}: DigitConsecutiveAutomatedPanelProps) {
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

      {/* Live 2-slot percentage readout — pending digit at 50%, jumps to
          100% on a repeat, then resets. Each column's container fills
          from empty toward full exactly as its percentage grows (half
          full at 50%, completely full at 100%), with the percentage
          shown inside the container itself and the digit number below
          it. */}
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
