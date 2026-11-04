import { armLevels, touched } from '../price-guard';

describe('Price Guard', () => {
    const levels = { sell: 1.1050, buy: 1.0950 };

    it('only watches levels that are still ahead of the price (never trades the moment it is switched on)', () => {
        expect(armLevels(levels, 1.1)).toEqual({ sell: 1.105, buy: 1.095 });
        expect(armLevels(levels, 1.106)).toEqual({ sell: null, buy: 1.095 });
        expect(armLevels(levels, 1.09)).toEqual({ sell: 1.105, buy: null });
        expect(armLevels({ sell: null, buy: 0 }, 1.1)).toEqual({ sell: null, buy: null });
    });

    it('SELL when price rises to the Sell SL line, BUY when it falls to the Buy SL line', () => {
        const armed = armLevels(levels, 1.1);
        expect(touched(armed, 1.1049, new Set())).toBeNull();
        expect(touched(armed, 1.105, new Set())).toBe('SELL');
        expect(touched(armed, 1.0951, new Set())).toBeNull();
        expect(touched(armed, 1.095, new Set())).toBe('BUY');
    });

    it('a side that already fired does not fire again', () => {
        const armed = armLevels(levels, 1.1);
        expect(touched(armed, 1.11, new Set(['SELL']))).toBeNull();
        expect(touched(armed, 1.09, new Set(['SELL']))).toBe('BUY');
    });

    it('ignores a price that is not a number', () => {
        expect(touched(armLevels(levels, 1.1), NaN, new Set())).toBeNull();
    });
});

import { groupTotal, groupVerdict } from '../price-guard';

describe('Price Guard group', () => {
    const rows = (profits: number[]) => profits.map((profit, i) => ({ id: i + 1, profit, result: null, closed: false }));
    const group = (over = {}) => ({ side: 'SELL' as const, ids: [1, 2, 3, 4, 5], takeProfit: 5, stopLoss: null, done: false, ...over });

    it('5 trades at +1 each reach a combined take profit of 5 and all close', () => {
        expect(groupTotal(group(), rows([1, 1, 1, 1, 1]))).toBe(5);
        expect(groupVerdict(group(), rows([1, 1, 1, 1, 1]))).toBe('tp');
        expect(groupVerdict(group(), rows([1, 1, 1, 1, 0.5]))).toBeNull();
    });

    it('a trade that closed by itself counts at its final result', () => {
        const r = rows([1, 1, 1, 1, 1]);
        r[0] = { id: 1, profit: 1, result: 2, closed: true };
        expect(groupTotal(group(), r)).toBe(6);
    });

    it('a combined stop loss closes the group, and a finished group is not checked again', () => {
        expect(groupVerdict(group({ takeProfit: null, stopLoss: 3 }), rows([-1, -1, -1, 0, 0]))).toBe('sl');
        expect(groupVerdict(group({ done: true }), rows([9, 9, 9, 9, 9]))).toBeNull();
    });

    it('no target set means nothing closes it', () => {
        expect(groupVerdict(group({ takeProfit: null }), rows([50, 50, 50, 50, 50]))).toBeNull();
    });
});

describe('Price Guard group switched off', () => {
    it('a group switched off is not closed even when its target is reached, and watches again when switched on', () => {
        const rows = [{ id: 1, profit: 9, result: null, closed: false }];
        const g = { side: 'BUY' as const, ids: [1], takeProfit: 5, stopLoss: null, done: false, active: false };
        expect(groupVerdict(g, rows)).toBeNull();
        expect(groupVerdict({ ...g, active: true }, rows)).toBe('tp');
    });
});
