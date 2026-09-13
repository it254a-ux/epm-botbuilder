import type { ContractMode, TradeType } from './digit-types';

/**
 * Digit-contract equivalent of @deriv/core's StrategyProgram, which is
 * CALL/PUT-only and can't express DIGITMATCH/DIGITOVER/etc. This type is
 * local to the digits feature and consumed by DigitAutomatedPanel /
 * DigitBotLibraryPanel — it never crosses into Rise/Fall code.
 */
export interface DigitStrategyProgram {
  id: string;
  label: string;
  baseStake: number;
  stakeRule:
    | { type: 'martingale'; multiplier: number }
    | { type: 'dalembert'; increment: number };
  tradeType: TradeType;
  contractMode: ContractMode;
  /** Only meaningful for Matches/Differs and Over/Under; ignored for Even/Odd. */
  selectedDigit: number;
  duration: number;
  profitThreshold: number | null;
  lossThreshold: number | null;
}

export interface DigitBotListing {
  id: string;
  name: string;
  description: string;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Aggressive';
  program: DigitStrategyProgram;
}

export const DIGIT_BOT_LIBRARY: DigitBotListing[] = [
  {
    id: 'digit-classic-martingale',
    name: 'Classic Martingale — Differs',
    description:
      'Bets the last digit will differ from the predicted digit. Doubles the stake after every loss, resets after a win. Stake grows fast during a losing streak.',
    riskLabel: 'Aggressive',
    program: {
      id: 'digit-classic-martingale',
      label: 'Classic Martingale — Differs',
      baseStake: 10,
      stakeRule: { type: 'martingale', multiplier: 2 },
      tradeType: 'matches-differs',
      contractMode: 'DIGITDIFF',
      selectedDigit: 5,
      duration: 5,
      profitThreshold: 10,
      lossThreshold: 10,
    },
  },
  {
    id: 'digit-gentle-dalembert-over',
    name: "Gentle D'Alembert — Over",
    description:
      "Bets the last digit will be over the predicted digit. Increases stake by a fixed unit after a loss, decreases by the same unit after a win.",
    riskLabel: 'Medium',
    program: {
      id: 'digit-gentle-dalembert-over',
      label: "Gentle D'Alembert — Over",
      baseStake: 10,
      stakeRule: { type: 'dalembert', increment: 2 },
      tradeType: 'over-under',
      contractMode: 'DIGITOVER',
      selectedDigit: 2,
      duration: 5,
      profitThreshold: 10,
      lossThreshold: 10,
    },
  },
  {
    id: 'digit-even-martingale',
    name: 'Even/Odd Martingale',
    description:
      'Bets the last digit will be even. Doubles the stake after every loss, resets after a win.',
    riskLabel: 'High',
    program: {
      id: 'digit-even-martingale',
      label: 'Even/Odd Martingale',
      baseStake: 10,
      stakeRule: { type: 'martingale', multiplier: 2 },
      tradeType: 'even-odd',
      contractMode: 'DIGITEVEN',
      selectedDigit: 5,
      duration: 5,
      profitThreshold: 10,
      lossThreshold: 10,
    },
  },
];
