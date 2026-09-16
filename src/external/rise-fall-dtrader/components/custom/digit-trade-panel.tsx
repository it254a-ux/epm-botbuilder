
import { Input } from '@/external/rise-fall-dtrader/components/ui/input';
import { Label } from '@/external/rise-fall-dtrader/components/ui/label';
import { Skeleton } from '@/external/rise-fall-dtrader/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/external/rise-fall-dtrader/components/ui/toggle-group';
import type { DurationLimits, ProposalInfo } from '@deriv/core';
import type { ContractMode, TradeType, DigitStats } from '@/external/rise-fall-dtrader/lib/digit-types';

interface DigitTradePanelProps {
  tradeType: TradeType;
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
  proposal: ProposalInfo | null;
  isProposalLoading: boolean;
}

const CONTRACT_MODE_OPTIONS: Record<TradeType, { value: ContractMode; label: string }[]> = {
  'matches-differs': [
    { value: 'DIGITMATCH', label: 'Matches' },
    { value: 'DIGITDIFF', label: 'Differs' },
  ],
  'over-under': [
    { value: 'DIGITOVER', label: 'Over' },
    { value: 'DIGITUNDER', label: 'Under' },
  ],
  'even-odd': [
    { value: 'DIGITEVEN', label: 'Even' },
    { value: 'DIGITODD', label: 'Odd' },
  ],
};

function getPredictionText(contractMode: ContractMode): string {
  switch (contractMode) {
    case 'DIGITMATCH':
      return 'match';
    case 'DIGITDIFF':
      return 'differ from';
    case 'DIGITOVER':
      return 'be over';
    case 'DIGITUNDER':
      return 'be under';
    case 'DIGITEVEN':
      return 'be even';
    case 'DIGITODD':
      return 'be odd';
  }
}

function showDigitInPrediction(contractMode: ContractMode): boolean {
  return contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';
}

export function DigitTradePanel({
  tradeType,
  contractMode,
  onContractModeChange,
  stake,
  onStakeChange,
  duration,
  onDurationChange,
  durationLimits,
  proposal,
  isProposalLoading,
  selectedDigit,
}: DigitTradePanelProps) {
  const modeOptions = CONTRACT_MODE_OPTIONS[tradeType];

  return (
    <div className="relative z-[9999] lg:static lg:z-auto w-full space-y-1.5 lg:max-w-[240px] lg:space-y-2">
      <ToggleGroup
        type="single"
        value={contractMode}
        onValueChange={value => {
          if (value) onContractModeChange(value as ContractMode);
        }}
        className="w-full gap-0 rounded-full bg-muted p-0.5"
      >
        {modeOptions.map(opt => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="flex-1 h-6 rounded-full text-[10px] font-medium text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:font-bold data-[state=on]:shadow-sm hover:text-foreground"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-1 gap-1.5">
        <div className="space-y-0.5">
          <Label htmlFor="digit-stake" className="text-[10px] text-muted-foreground">
            Stake
          </Label>
          <Input
            id="digit-stake"
            type="number"
            value={stake}
            onChange={e => onStakeChange(e.target.value)}
            onKeyDown={e => {
              if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
            }}
            min={0}
            step="0.01"
            labelRight="USD"
            className="h-7 text-xs px-2"
          />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor="digit-duration" className="text-[10px] text-muted-foreground">
            Duration
          </Label>
          <Input
            id="digit-duration"
            type="number"
            value={duration}
            onChange={e => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) onDurationChange(val);
            }}
            min={durationLimits.min}
            max={durationLimits.max}
            step={1}
            labelRight="Ticks"
            className="h-7 text-xs px-2"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border p-1.5 sm:p-2 bg-muted/20 space-y-1 sm:space-y-1.5">
        <p className="text-[10px] text-muted-foreground mb-0">Prediction</p>
        <p className="text-[10px] font-medium">
          Last digit of the price will{' '}
          <span className="text-primary font-bold">{getPredictionText(contractMode)}</span>
          {showDigitInPrediction(contractMode) && (
            <>
              {' '}
              <span className="inline-flex w-4 h-4 rounded-full bg-primary text-primary-foreground items-center justify-center text-[10px] font-bold">
                {selectedDigit}
              </span>
            </>
          )}
        </p>
        {(proposal || isProposalLoading) && (
          <div className="flex items-center justify-between pt-0.5 border-t border-border">
            <span className="text-[10px] text-muted-foreground">Payout</span>
            {isProposalLoading ? (
              <Skeleton className="h-3 w-20" />
            ) : (
              <span className="text-[10px] font-bold text-foreground">
                {proposal!.payout.toFixed(2)} USD
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
