import { armLevels, armTarget, targetReached, touched } from '../price-guard';

describe('Sweep Sniper levels', () => {
    const levels = { sell: 1.105, buy: 1.095 };

    it('remembers which side of each line the price was on, and leaves out a price exactly on a line', () => {
        expect(armLevels(levels, 1.1)).toEqual({ sell: 1.105, buy: 1.095, sellFrom: 'below', buyFrom: 'above' });
        expect(armLevels(levels, 1.106)).toEqual({ sell: 1.105, buy: 1.095, sellFrom: 'above', buyFrom: 'above' });
        expect(armLevels(levels, 1.09)).toEqual({ sell: 1.105, buy: 1.095, sellFrom: 'below', buyFrom: 'below' });
        expect(armLevels({ sell: 1.1, buy: 0 }, 1.1)).toEqual({ sell: null, buy: null, sellFrom: undefined, buyFrom: undefined });
    });

    it('a line above the price is touched on the way up, a line below it on the way down', () => {
        const armed = armLevels(levels, 1.1);
        expect(touched(armed, 1.1049, new Set())).toBeNull();
        expect(touched(armed, 1.105, new Set())).toBe('SELL');
        expect(touched(armed, 1.0951, new Set())).toBeNull();
        expect(touched(armed, 1.095, new Set())).toBe('BUY');
    });

    it('a Sell line the price was already above when armed is touched when price comes back down to it (the Gold case)', () => {
        const armed = armLevels({ sell: 4127.32, buy: 4091.58 }, 4128.62);
        expect(touched(armed, 4128, new Set())).toBeNull();
        expect(touched(armed, 4127.4, new Set())).toBeNull();
        expect(touched(armed, 4127.3, new Set())).toBe('SELL');
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

describe('My target (a price marked by hand)', () => {
    it('remembers which side of the target the price is on, like the sweep lines', () => {
        expect(armTarget(4075, 'BUY', 4060)).toEqual({ price: 4075, side: 'BUY', from: 'below' });
        expect(armTarget(4050, 'SELL', 4060)).toEqual({ price: 4050, side: 'SELL', from: 'above' });
    });

    it('arms nothing without a target, without a live price, or with the price exactly on the target', () => {
        expect(armTarget(null, 'BUY', 4060)).toBeNull();
        expect(armTarget(0, 'BUY', 4060)).toBeNull();
        expect(armTarget(4075, 'BUY', null)).toBeNull();
        expect(armTarget(4060, 'BUY', 4060)).toBeNull();
    });

    it('a target above the price is reached on the way up, a target below it on the way down', () => {
        const up = armTarget(4075, 'BUY', 4060);
        expect(targetReached(up, 4074.9)).toBe(false);
        expect(targetReached(up, 4075)).toBe(true);
        expect(targetReached(up, 4080)).toBe(true);
        const down = armTarget(4050, 'SELL', 4060);
        expect(targetReached(down, 4050.1)).toBe(false);
        expect(targetReached(down, 4050)).toBe(true);
        expect(targetReached(down, 4040)).toBe(true);
    });

    it('is never reached when nothing is armed or the price is not a number', () => {
        expect(targetReached(null, 4075)).toBe(false);
        expect(targetReached(armTarget(4075, 'BUY', 4060), NaN)).toBe(false);
    });
});
