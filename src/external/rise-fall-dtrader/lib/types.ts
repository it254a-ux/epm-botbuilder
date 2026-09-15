export type {
  ActiveSymbol,
  Tick,
  TicksHistoryResponse,
  ContractsForResponse,
  ContractInfo,
  DurationLimits,
  ProposalResponse,
  ProposalInfo,
  BuyResponse,
  BuyResult,
} from '@/external/deriv-core';

export type { OpenPosition } from '@/external/rise-fall-dtrader/hooks/use-open-positions';
export type { ClosedPosition } from '@/external/rise-fall-dtrader/hooks/use-closed-positions';

// Moved from dtrader's own packages/core (not part of bot-builder's shared
// vendored @/external/deriv-core, since this is dtrader-specific strategy
// config, not a generic Deriv API auth/trading type).
export type StakeRule =
    | { type: 'martingale'; multiplier: number; maxStake?: number }
    | { type: 'dalembert'; increment: number; maxStake?: number }
    | { type: 'fixed' };

export interface StrategyProgram {
    id: string;
    label: string;
    baseStake: number;
    stakeRule: StakeRule;
    direction: 'CALL' | 'PUT';
    allowEquals?: boolean;
    duration: number;
    durationUnit: string;
    profitThreshold: number | null;
    lossThreshold: number | null;
}

export type Direction = 'CALL' | 'PUT';

export type PositionFilter = 'open' | 'closed' | 'all';

export type { DurationSelectUnit, DurationOption } from '@/external/rise-fall-dtrader/lib/duration-utils';
