
import { useMemo } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Input } from '@/external/rise-fall-dtrader/components/ui/input';
import { Label } from '@/external/rise-fall-dtrader/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/external/rise-fall-dtrader/components/ui/select';
import { Switch } from '@/external/rise-fall-dtrader/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import { EndTimePicker } from '@/external/rise-fall-dtrader/components/custom/end-time-picker';
import type { ActiveSymbol, ProposalInfo } from '@/external/deriv-core';
import type { ApiWsHandle as DerivWS } from '@/external/rise-fall-dtrader/lib/api-ws-adapter';
import type { Direction, DurationSelectUnit, DurationOption } from '../lib/types';

interface TradeControlsProps {
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
  allowEquals: boolean;
  onAllowEqualsChange: (value: boolean) => void;
  isConnected: boolean;
  stake: string;
  onStakeChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  durationOptions: DurationOption[];
  durationUnit: DurationSelectUnit;
  onDurationUnitChange: (unit: DurationSelectUnit) => void;
  endDate: Date | undefined;
  onEndDateChange: (date: Date | undefined) => void;
  endTime: string;
  onEndTimeChange: (time: string) => void;
  ws: DerivWS | null;
  activeSymbol: ActiveSymbol | null;
  proposal: ProposalInfo | null;
  /** Whether the user is authenticated — shows the View reports link when true. */
  isAuthenticated?: boolean;
}

export function TradeControls({
  direction,
  onDirectionChange,
  allowEquals,
  onAllowEqualsChange,
  isConnected,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  durationOptions,
  durationUnit,
  onDurationUnitChange,
  endDate,
  onEndDateChange,
  endTime,
  onEndTimeChange,
  ws,
  activeSymbol,
  proposal,
  isAuthenticated,
}: TradeControlsProps) {
  const activeOption = durationOptions.find(o => o.unit === durationUnit);

  const endTimeOption = durationOptions.find(o => o.unit === 'end-time');
  const { endTimeMinDate, endTimeMaxDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      endTimeMinDate: today,
      endTimeMaxDate: endTimeOption
        ? new Date(today.getTime() + endTimeOption.max * 86400000)
        : new Date(today.getTime() + 365 * 86400000),
    };
  }, [endTimeOption]);

  return (
    <div className="relative z-[9999] lg:static lg:z-auto w-full max-w-full lg:max-w-[200px] mx-auto space-y-1.5 lg:space-y-2">
      {/* Rise / Fall direction segmented control */}
      <ToggleGroup
        type="single"
        value={direction}
        onValueChange={(value) => {
          if (value === 'CALL' || value === 'PUT') onDirectionChange(value);
        }}
        className="w-full gap-0 rounded-full bg-muted p-0.5"
      >
        <ToggleGroupItem
          value="CALL"
          className="flex-1 h-6 rounded-full text-[9px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-green-600 data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
        >
          Rise
        </ToggleGroupItem>
        <ToggleGroupItem
          value="PUT"
          className="flex-1 h-6 rounded-full text-[9px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-destructive data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
        >
          Fall
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Allow equals */}
      <div className="flex items-center justify-between">
        <Label htmlFor="allow-equals" className="text-[9px] cursor-pointer">Allow equals</Label>
        <Switch
          id="allow-equals"
          checked={allowEquals}
          onCheckedChange={onAllowEqualsChange}
        />
      </div>

      {/* Three-column row: Duration | Stake | Payout.
          Each column is independently scrollable (max-h + overflow-y-auto)
          so a column's content never pushes the others out of alignment,
          per the requested mobile layout. Thin dividers separate columns. */}
      <div className="grid grid-cols-3 divide-x divide-border rounded-md border border-border overflow-hidden">
        {/* Column 1: Duration */}
        <div className="flex flex-col items-center gap-1 px-1 py-1.5 max-h-28 overflow-y-auto">
          <Select
            value={durationUnit}
            onValueChange={(v) => {
              const opt = durationOptions.find(o => o.unit === v);
              if (opt) onDurationUnitChange(opt.unit);
            }}
          >
            <SelectTrigger className="h-5 w-full border-0 shadow-none bg-transparent px-1 text-[9px] justify-center gap-1 text-muted-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durationOptions.map(opt => (
                <SelectItem key={opt.unit} value={opt.unit} className="text-[11px]">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {durationUnit !== 'end-time' && (
            <Input
              type="number"
              value={duration}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) onDurationChange(val);
              }}
              min={activeOption?.min}
              max={activeOption?.max}
              step={1}
              className="h-7 w-full text-[11px] text-center px-1"
            />
          )}

          {durationUnit === 'end-time' && (
            <EndTimePicker
              ws={ws}
              isConnected={isConnected}
              activeSymbol={activeSymbol}
              endDate={endDate}
              onEndDateChange={onEndDateChange}
              endTime={endTime}
              onEndTimeChange={onEndTimeChange}
              minDate={endTimeMinDate}
              maxDate={endTimeMaxDate}
            />
          )}
        </div>

        {/* Column 2: Stake */}
        <div className="flex flex-col items-center gap-1 px-1 py-1.5 max-h-28 overflow-y-auto">
          <Label htmlFor="stake" className="text-[9px] text-muted-foreground text-center leading-tight">
            Stake (USD)
          </Label>
          <Input
            id="stake"
            type="number"
            value={stake}
            onChange={(e) => onStakeChange(e.target.value)}
            onKeyDown={(e) => {
              if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
            }}
            min={0}
            step="0.01"
            className="h-7 w-full text-[11px] text-center px-1"
          />
        </div>

        {/* Column 3: Payout (read-only) — new display, previously payout
            was only shown as small text inside the Buy button. */}
        <div className="flex flex-col items-center gap-1 px-1 py-1.5 max-h-28 overflow-y-auto">
          <Label className="text-[9px] text-muted-foreground text-center leading-tight">
            Payout
          </Label>
          <div className="flex h-7 w-full items-center justify-center rounded-md border border-input bg-transparent px-1 text-[11px] font-semibold text-green-600">
            {proposal ? `${proposal.payout.toFixed(2)}` : '-'}
          </div>
        </div>
      </div>

      {/* View reports — shown when authenticated. Market contracts and the
          Buy button used to live in this bottom row too; both have moved
          up above TradeControls (Buy) and into the ModeRail icon row
          (Market contracts), so this row now only holds the reports link. */}
      {isAuthenticated && (
        <div className="border-t border-border pt-2">
          <Link
            href="/reports"
            className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileText size={12} strokeWidth={1.75} />
            View reports
          </Link>
        </div>
      )}
    </div>
  );
}
