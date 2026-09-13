
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { Switch } from '@/external/rise-fall-dtrader/components/ui/switch';
import { NumberField } from '@/external/rise-fall-dtrader/components/custom/automation-controls';
import type { UseDigitsEntryAutomationReturn, EntryStrategy } from '@/external/rise-fall-dtrader/hooks/use-digits-entry-automation';
import type { ContractMode, DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';
import type { DurationLimits } from '@/external/deriv-core';

interface DigitEntryAutomatedPanelProps {
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
  automation: UseDigitsEntryAutomationReturn;
}

const MODE_OPTIONS: { value: ContractMode; label: string }[] = [
  { value: 'DIGITOVER', label: 'Over' },
  { value: 'DIGITUNDER', label: 'Under' },
];

/** Preset round counts offered in the Rounds selector, matching the other automated bots in the app. */
const ROUND_OPTIONS = [3, 5, 10, 20];

/**
 * The two entry strategies. Edge (default) is the original behavior: waits
 * for the digit adjacent to the barrier. Direct waits for the barrier
 * digit itself to appear, then fires.
 */
const ENTRY_STRATEGY_OPTIONS: { value: EntryStrategy; label: string }[] = [
  { value: 'edge', label: 'Edge' },
  { value: 'direct', label: 'Direct' },
];

/**
 * Automated panel for Digit Over/Under only. Unlike the martingale-based
 * DigitAutomatedPanel used by Matches/Differs and Even/Odd, this bot places
 * no trade at all when Start is clicked — it arms itself and watches the
 * live digit stream, firing exactly one buy the instant the trigger digit
 * appears, then lets the contract settle on its own like any other digit
 * contract.
 *
 * LAYOUT FIX: removed lg:max-w-[240px] so content stretches to fill the
 * full width of the parent Card, matching the left-edge alignment on the
 * right side too. No other spacing or font sizes changed.
 */
export function DigitEntryAutomatedPanel({
  contractMode,
  onContractModeChange,
  digitStats,
  lastDigit,
  selectedDigit,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  isConnected,
  isAuthenticated,
  automation,
}: DigitEntryAutomatedPanelProps) {
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
  const isOver = contractMode === 'DIGITOVER';

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

      {/* Prediction summary — mirrors the plain-language "Last digit of the
          price will be over/under N" readout used elsewhere in the app, so
          the chosen digit is unambiguous at a glance. This does not reveal
          the internal trigger digit (which depends on Entry Strategy) —
          only the barrier the user actually picked. While Hybrid Mode is
          running, this updates on its own each round since contractMode/
          selectedDigit are driven by the automation hook. */}
      <div className="rounded-md border border-border bg-muted/30 px-2 py-1 space-y-0.5">
        <p className="text-[10px] text-muted-foreground">Prediction</p>
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-foreground">
            Last digit of the price will be{' '}
            <span className={isOver ? 'font-bold text-green-600 dark:text-green-400' : 'font-bold text-red-500'}>
              {isOver ? 'over' : 'under'}
            </span>
          </p>
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
              isOver ? 'bg-green-600' : 'bg-red-500'
            }`}
          >
            {selectedDigit}
          </span>
        </div>
      </div>

      {/* Stake + Duration paired two-per-row. Unconditional grid — same on
          mobile and desktop. */}
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

      {/* Entry Strategy selector. Edge (default) is the original behavior.
          Direct waits for the barrier digit itself. Combinable with
          Hybrid Mode below. Disabled while running, same as Stake/Duration
          above, since it's a Start-time setting. */}
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground">Entry Strategy</p>
        <ToggleGroup
          type="single"
          value={settings.entryStrategy}
          disabled={isRunning}
          onValueChange={(value) => {
            if (value) setSettings({ ...settings, entryStrategy: value as EntryStrategy });
          }}
          className="w-full gap-1"
        >
          {ENTRY_STRATEGY_OPTIONS.map((opt) => (
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

      {/* Hybrid Mode toggle. Off by default (matches existing behavior
          exactly). When on, the bot alternates the barrier automatically
          each round instead of staying on one. Disabled while running,
          same as the other Start-time settings above. No subtitle here on
          purpose — the specific barrier pair is not shown on screen. */}
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1">
        <div className="space-y-0.5">
          <p className="text-[10px] font-medium text-foreground">Hybrid Mode</p>
        </div>
        <Switch
          checked={settings.hybridMode}
          disabled={isRunning}
          onCheckedChange={(checked) => setSettings({ ...settings, hybridMode: checked })}
        />
      </div>

      {/* Rounds — moved here, immediately above the armed-status readout,
          as the last setting before Start/Stop. */}
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground">Rounds</p>
        <ToggleGroup
          type="single"
          value={String(settings.maxRounds)}
          disabled={isRunning}
          onValueChange={(value) => {
            if (value) setSettings({ ...settings, maxRounds: Number(value) });
          }}
          className="w-full gap-1"
        >
          {ROUND_OPTIONS.map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              className="flex-1 h-6 rounded-md border border-border text-[10px] font-medium text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:font-bold hover:text-foreground"
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Armed-status readout — intentionally does not reveal the internal
          trigger digit. That's kept private; only the fact that the bot is
          armed and watching is shown. */}
      <div className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[10px]">
        {isValidSetup ? (
          <span className="text-muted-foreground">Armed — watching the tick stream for your entry signal…</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">{statusMessage}</span>
        )}
      </div>

      <div className="pt-0.5">
        {isRunning || phase === 'entered' ? (
          <Button variant="destructive" className="w-full h-7 text-[10px]" onClick={() => stop('Stopped manually')}>
            Stop
          </Button>
        ) : (
          <Button className="w-full h-7 text-[10px]" disabled={!canStart} onClick={start}>
            {!isAuthenticated
              ? 'Log in to trade'
              : !isConnected
              ? 'Connecting…'
              : !isValidSetup
              ? 'Pick a valid barrier'
              : `Start Bot (${settings.maxRounds} rounds)`}
          </Button>
        )}
      </div>

      {/* Live status while watching or holding a placed trade */}
      {(isRunning || phase === 'entered') && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-0.5 space-y-0.5 text-[10px]">
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

      {/* Running results ledger for the current (or most recently finished)
          run — total at top, then one row per settled round in order
          (R1 first). Replaces the old single "last trade" readout. No
          per-round barrier tag here — that would reveal the hybrid pair. */}
      {results.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1 space-y-0.5 text-[10px]">
          <div className="flex justify-between items-center border-b border-border pb-1">
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
        <p className="text-[10px] text-muted-foreground rounded-md border border-border bg-muted/20 px-2 py-1">
          {lastError}
        </p>
      )}
    </div>
  );
}
