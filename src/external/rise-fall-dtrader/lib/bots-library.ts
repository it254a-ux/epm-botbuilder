import type { StrategyProgram } from '@deriv/core';

export interface BotListing {
  id: string;
  name: string;
  description: string;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Aggressive';
  program: StrategyProgram;
}

export const BOT_LIBRARY: BotListing[] = [
  {
    id: 'classic-martingale',
    name: 'Classic Martingale',
    description:
      'Doubles the stake after every loss, resets to base stake after a win. High risk — stake grows exponentially during a losing streak.',
    riskLabel: 'Aggressive',
    program: {
      id: 'classic-martingale',
      label: 'Classic Martingale',
      baseStake: 10,
      stakeRule: { type: 'martingale', multiplier: 2 },
      direction: 'CALL',
      allowEquals: true,
      duration: 5,
      durationUnit: 'm',
      profitThreshold: 10,
      lossThreshold: 10,
    },
  },
  {
    id: 'gentle-dalembert',
    name: "Gentle D'Alembert",
    description:
      'Increases stake by a small fixed unit after a loss, decreases by the same unit after a win. Grows more slowly than Martingale.',
    riskLabel: 'Medium',
    program: {
      id: 'gentle-dalembert',
      label: "Gentle D'Alembert",
      baseStake: 10,
      stakeRule: { type: 'dalembert', increment: 2 },
      direction: 'CALL',
      allowEquals: true,
      duration: 5,
      durationUnit: 'm',
      profitThreshold: 10,
      lossThreshold: 10,
    },
  },
];
