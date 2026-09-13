export interface AccumulatorContractInfo {
  barriers: number;
  contract_category: string;
  contract_type: string;
  default_stake: number;
  expiry_type: string;
  growth_rate_range: number[];
  high_barrier: string;
  low_barrier: string;
  market: string;
  max_contract_duration: string;
  min_contract_duration: string;
  sentiment: string;
  submarket: string;
  underlying_symbol: string;
}

export type GrowthRate = number;

/** Settings for the accumulator-specific automation loop. */
export interface AccumulatorAutomationSettings {
  /** Stake placed on every trade (fixed — no martingale progression). */
  baseStake: number;
  /** Sell the contract once tick_count reaches this value. */
  ticksToHold: number;
  /** Stop the run after this many completed trades (whichever comes first). */
  maxTrades: number;
  /** Stop the run once cumulative net profit reaches this amount (USD). */
  targetProfit: number;
}

export const DEFAULT_ACCUMULATOR_AUTOMATION_SETTINGS: AccumulatorAutomationSettings = {
  baseStake: 1.5,
  ticksToHold: 2,
  maxTrades: 3,
  targetProfit: 5,
};
