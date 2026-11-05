import { estimateProfit } from '../forex-live/trade-engine';

export type PositionSide = 'BUY' | 'SELL';

/**
 * The Position marker: the first price is the entry, every later price is a point where the position could be
 * closed. The side (BUY or SELL) is the one chosen in the pop-up before placing the dots. Each point shows the
 * profit of that side from the entry to that point (an estimate, Deriv's fee not included); the entry itself is 0.
 */
export function positionProfits(prices: number[], stake: number, multiplier: number, side: PositionSide): Array<number | null> {
    const entry = prices[0];
    return prices.map((p, i) => (i === 0 ? 0 : estimateProfit(side, stake, multiplier, entry, p)));
}
