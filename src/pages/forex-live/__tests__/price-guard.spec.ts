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
