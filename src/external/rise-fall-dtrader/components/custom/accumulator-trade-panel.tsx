
import Link from 'next/link';
import { Button } from '@/external/rise-fall-dtrader/components/ui/button';
import { Input } from '@/external/rise-fall-dtrader/components/ui/input';
import { Label } from '@/external/rise-fall-dtrader/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/external/rise-fall-dtrader/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/external/rise-fall-dtrader/components/ui/tooltip';
import type { AccumulatorProposalInfo } from '@/external/rise-fall-dtrader/hooks/use-accumulator-proposal';
import type { GrowthRate } from '@/external/rise-fall-dtrader/lib/accumulator-types';
import type { OpenPosition } from '@/external/rise-fall-dtrader/lib/types';

interface AccumulatorTradePanelProps {
  growthRate: GrowthRate;
  onGrowthRateChange: (rate: GrowthRate) => void;
  growthRateOptions: { value: number; label: string }[];
  stake: string;
  onStakeChange: (value: string) => void;
  takeProfit: string;
  onTakeProfitChange: (value: string) => void;
  proposal: AccumulatorProposalInfo | null;
  /** Shown in the "Active position" info block below. The Buy/Close button
   * itself now lives in accumulators-body.tsx, rendered directly under
   * TradeModeToggle — this panel only displays position info here. */
  activePosition?: OpenPosition | null;
  isAuthenticated?: boolean;
}

export function AccumulatorTradePanel({
  growthRate,
  onGrowthRateChange,
  growthRateOptions,
  stake,
  onStakeChange,
  takeProfit,
  onTakeProfitChange,
  proposal,
  activePosition,
  isAuthenticated,
}: AccumulatorTradePanelProps) {
  return (
    <div className="relative z-[9999] lg:static lg:z-auto w-full space-y-1.5 lg:max-w-[240px] lg:space-y-2">

      {/* Growth Rate selector */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <Label className="text-[10px] text-muted-foreground">Growth rate</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full border border-muted-foreground/40 text-[9px] text-muted-foreground">
                  i
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] z-[10050]">
                <p className="text-xs">
                  Your stake grows by the selected percentage for each tick that stays within the barrier range.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={String(growthRate)}
          onValueChange={(value) => {
            onGrowthRateChange(parseFloat(value));
          }}
        >
          <SelectTrigger className="h-7 text-xs px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[10050]">
            {growthRateOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stake */}
      <div className="space-y-0.5">
        <Label htmlFor="accu-stake" className="text-[10px] text-muted-foreground">Stake</Label>
        <Input
          id="accu-stake"
          type="number"
          value={stake}
          onChange={(e) => onStakeChange(e.target.value)}
          onKeyDown={(e) => {
            if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
          }}
          min={0}
          step="0.01"
          labelRight="USD"
          className="h-7 text-xs px-2"
        />
      </div>

      {/* Take Profit */}
      <div className="space-y-0.5">
        <Label htmlFor="accu-take-profit" className="text-[10px] text-muted-foreground">Take profit</Label>
        <Input
          id="accu-take-profit"
          type="number"
          value={takeProfit}
          onChange={(e) => onTakeProfitChange(e.target.value)}
          onKeyDown={(e) => {
            if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
          }}
          min={0}
          step="0.01"
          placeholder="-"
          labelRight="USD"
          className="h-7 text-xs px-2"
        />
      </div>

      {/* Proposal info */}
      {proposal && !activePosition && (
        <div className="rounded-lg bg-muted/50 px-2 py-1 space-y-0.5 text-[10px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max payout</span>
            <span className="font-medium">{proposal.maxPayout.toFixed(2)} USD</span>
          </div>
        </div>
      )}

      {/* Active position info */}
      {activePosition && (
        <div className="rounded-lg bg-muted/50 px-2 py-1 space-y-0.5 text-[10px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current value</span>
            <span className="font-medium">
              {(parseFloat(activePosition.buy_price) + parseFloat(activePosition.profit)).toFixed(2)} {activePosition.currency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Profit / Loss</span>
            <span className={parseFloat(activePosition.profit) >= 0 ? 'font-medium text-green-600' : 'font-medium text-destructive'}>
              {parseFloat(activePosition.profit) >= 0 ? '+' : ''}{parseFloat(activePosition.profit).toFixed(2)} {activePosition.currency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total return</span>
            <span className="font-semibold">
              {(parseFloat(activePosition.buy_price) + parseFloat(activePosition.profit)).toFixed(2)} {activePosition.currency}
            </span>
          </div>
        </div>
      )}

      {/* View your positions — shown when authenticated */}
      {isAuthenticated && (
        <Button
          asChild
          variant="ghost"
          className="w-full text-[10px] text-muted-foreground hover:text-foreground h-6"
        >
          <Link href="/reports">View your positions →</Link>
        </Button>
      )}

    </div>
  );
}
