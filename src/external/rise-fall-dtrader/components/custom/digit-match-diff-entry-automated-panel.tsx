
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type {
  UseDigitsMatchDiffEntryAutomationReturn,
  DigitShiftMode,
} from '@/external/rise-fall-dtrader/hooks/use-digits-match-diff-entry-automation';
import type { ContractMode, DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';
import type { DurationLimits } from '@/external/deriv-core';

interface DigitMatchDiffEntryAutomatedPanelProps {
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;
  digitStats: DigitStats;
  lastDigit: number | null;
  selectedDigit: number;
  onSelectedDigitChange: (digit: number) => void;
  stake: string;
  onStakeChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  durationLimits: DurationLimits;
  isConnected: boolean;
  isAuthenticated: boolean;
  automation: UseDigitsMatchDiffEntryAutomationReturn;
}

const MODE_OPTIONS: { value: ContractMode; label: string }[] = [
  { value: 'DIGITMATCH', label: 'Matches' },
  { value: 'DIGITDIFF', label: 'Differs' },
];

/** Preset round counts offered in the Rounds selector, matching the other automated bots in the app. */
const ROUND_OPTIONS = [3, 5, 10, 20, 50, 100];

/**
 * How the watched digit moves between rounds — see DigitShiftMode in the
 * hook. Labels are intentionally generic (Hold/Swing/Flex) rather than
 * descriptive of the underlying mechanism (fixed/bounce/random) — the
 * underlying values are unchanged, only what's shown on screen.
 */
const SHIFT_MODE_OPTIONS: { value: DigitShiftMode; label: string }[] = [
  { value: 'fixed', label: 'Hold' },
  { value: 'bounce', label: 'Swing' },
  { value: 'random', label: 'Flex' },
];

/**
 * Entry-watcher panel for Digit Matches/Differs, separate from the
 * classic martingale-based DigitAutomatedPanel (still used, untouched, for
 * Even/Odd). Places no trade on Start — arms and watches the live digit
 * stream, firing exactly one buy the instant the selected digit appears,
 * then lets the contract settle on its own.
 *
 * Mode (Hold by default — original behavior): optionally the watched
 * digit can move every round instead of staying fixed — either Swing
 * (predictable 0→9→0 step) or Flex (fresh random digit each round, no
 * detectable pattern). Results ledger intentionally does not show which
 * digit each round watched, same privacy policy as the Over/Under panel.
 *
 * LAYOUT FIX: removed lg:max-w-[240px] so content stretches to fill the
 * full width of the parent Card, matching the left-edge alignment on the
 * right side too. No other spacing or font sizes changed.
 *
 * STATUS GRID: added to match the Consecutive/3-Streak/Frequency panels'
 * layout. This bot has no multi-tick buildup — it fires the instant the
 * watched digit appears — so there's no existing per-digit progress data
 * to plot (the hook's use-digits-match-diff-entry-automation.ts only
 * exposes triggerDigit, which is identical to selectedDigit). The grid is
 * wired to the selectedDigit prop this component already receives: that
 * digit is shown at 100% and every other digit at 0%. No new state was
 * added anywhere, and no hook file was touched.
 */
export function DigitMatchDiffEntryAutomatedPanel({
  contractMode,
  onContractModeChange,
  lastDigit,
  selectedDigit,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  isConnected,
  isAuthenticated,
  automation,
}: DigitMatchDiffEntryAutomatedPanelProps) {
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

      {/* Prediction summary. While a non-Hold mode is running, this updates
          on its own each round since selectedDigit is driven by the hook. */}
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
            {selectedDigit}
          </span>
        </div>
      </div>

      {/* Live Status readout, matching the Consecutive/3-Streak/Frequency
          bots' Status grid exactly. See the file-header note above for why
          this shows a flat 100%/0% split on selectedDigit instead of a
          buildup — this bot has no multi-tick progress concept to plot. */}
      <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 space-y-0.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-muted-foreground">Status</p>
          <p className="text-[9px] tabular-nums text-muted-foreground">
            {isRunning ? 'watching' : 'idle'}
          </p>
        </div>
        <div className="grid grid-cols-10 gap-0.5">
          {Array.from({ length: 10 }, (_, digit) => digit).map((digit) => {
            const pct = digit === selectedDigit ? 100 : 0;
            return (
              <div key={digit} className="flex flex-col items-center gap-0.5">
                <div className="relative h-8 w-full rounded-sm bg-muted overflow-hidden">
                  <div
                    className={`absolute bottom-0 left-0 w-full transition-all duration-300 ${
                      digit === selectedDigit ? 'bg-primary' : 'bg-foreground/30'
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`text-[7px] font-bold tabular-nums ${
                        digit === selectedDigit ? 'text-primary-foreground' : 'text-foreground'
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

      {/* Stake + Duration paired two-per-row, matching the other three
          digit panels. Unconditional grid — same on mobile and desktop. */}
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

      {/* Boost multiplier + Stop-loss — these already exist in this bot's
          hook (settings.multiplier drives the elevated-stake-after-a-loss
          streak; settings.lossThreshold drives the stop-loss check) and
          were already being used by the trading logic, just never exposed
          as controls in this panel. No new hook state was added — these
          two fields simply surface settings that already existed. Boost
          rounds and Take-profit are intentionally NOT added here: boost
          rounds is a hardcoded constant in this hook (not a settings
          field), and there is no take-profit/profitThreshold concept in
          this hook at all. */}
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Boost multiplier"
          value={settings.multiplier}
          onChange={(value) => setSettings({ ...settings, multiplier: Math.max(1, value ?? 10) })}
          suffix="×"
          disabled={isRunning}
          step={0.5}
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

      {/* Mode selector — Hold (original behavior) / Swing (predictable
          0→9→0 step) / Flex (fresh random digit every round, win or lose,
          so there's no detectable pattern). Defaults to Hold. Disabled
          while running, same as the other Start-time settings above.
          Section title kept generic on purpose — see file header note. */}
      <div className="space-y-0.5">
        <p className="text-[10px] text-muted-foreground">Mode</p>
        <ToggleGroup
          type="single"
          value={settings.digitShiftMode}
          disabled={isRunning}
          onValueChange={(value) => {
            if (value) setSettings({ ...settings, digitShiftMode: value as DigitShiftMode });
          }}
          className="w-full gap-1"
        >
          {SHIFT_MODE_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              className="flex-1 h-6 rounded-md border border-border text-[10px] font-medium text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:font-bold hover:text-foreground"
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[10px]">
        {isValidSetup ? (
          <span className="text-muted-foreground">Armed — watching the tick stream for your entry signal…</span>
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
              ? 'Pick a valid digit'
              : `Start Bot (${settings.maxRounds} rounds)`}
          </Button>
        )}
      </div>

      {(isRunning || phase === 'entered') && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-0.5 space-y-0 text-[10px]">
          <p className="text-[10px] font-medium text-blue-500 dark:text-blue-400">
            {phase === 'entered' ? 'Trade placed — waiting to settle…' : 'Watching for entry signal…'}
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

      {/* Results ledger — no per-round digit tag here, same as the
          Over/Under panel, so the running mode/pattern isn't visible on
          screen to anyone glancing at it. */}
      {results.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 space-y-0 text-[10px]">
          <div className="flex justify-between items-center border-b border-border pb-0.5">
            <span className="text-muted-foreground">RESULTS</span>
            <span className={`tabular-nums font-bold ${netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {netProfit >= 0 ? '+' : ''}
              {netProfit.toFixed(2)} USD
            </span>
          </div>
          {results.map((result, index) => (
            <div key={result.contractId} className="flex justify-between">
              <span className="text-muted-foreground">
                R{index + 1} ${result.stake.toFixed(2)}
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
        <p className="text-[10px] text-muted-foreground rounded-md border border-border bg-muted/20 px-2 py-0.5">
          {lastError}
        </p>
      )}
    </div>
  );
}
