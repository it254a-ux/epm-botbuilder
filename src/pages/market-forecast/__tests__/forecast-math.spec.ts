import { closedOnly, decimalsOf, leanOf, medianBars, readLevels, type PathCandle } from '../forecast-math';

const candle = (t: number, o: number, h: number, l: number, c: number): PathCandle => ({ t, o, h, l, c });

describe('medianBars', () => {
    it('takes the middle value of every path, per step', () => {
        const paths = [
            [candle(10, 100, 103, 99, 102)],
            [candle(10, 101, 104, 98, 101)],
            [candle(10, 102, 105, 97, 100)],
        ];
        expect(medianBars(paths)).toEqual([{ time: 10, open: 101, high: 104, low: 98, close: 101 }]);
    });
    it('always returns a valid candle (wicks contain the body)', () => {
        const paths = [[candle(1, 10, 9, 11, 12)], [candle(1, 10, 9, 11, 12)]]; // a broken high/low on purpose
        const [b] = medianBars(paths);
        expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
        expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
    });
    it('gives nothing for no paths', () => {
        expect(medianBars([])).toEqual([]);
    });
});

describe('leanOf', () => {
    it('only a clear majority is a lean', () => {
        expect(leanOf(1)).toBe('up');
        expect(leanOf(0.7)).toBe('up');
        expect(leanOf(0.5)).toBe('none');
        expect(leanOf(0.3)).toBe('down');
    });
});

describe('readLevels', () => {
    it('no trade means no levels', () => {
        expect(readLevels('none', '', '')).toEqual({ levels: null });
    });
    it('asks for both prices', () => {
        expect(readLevels('buy', '4100', '')).toHaveProperty('error');
    });
    it('checks the side against the prices', () => {
        expect(readLevels('buy', '4100', '4110')).toHaveProperty('error');
        expect(readLevels('sell', '4100', '4090')).toHaveProperty('error');
        expect(readLevels('buy', '4110', '4100')).toEqual({ levels: { side: 'buy', tp: 4110, sl: 4100 } });
        expect(readLevels('sell', '4,090', '4100')).toEqual({ levels: { side: 'sell', tp: 4.09, sl: 4100 } });
    });
});

describe('closedOnly / decimalsOf', () => {
    it('drops the candle that is still forming', () => {
        const bars = [1000, 1300, 1600].map(time => ({ time, open: 1, high: 1, low: 1, close: 1 }));
        expect(closedOnly(bars, 300, 1700).map(b => b.time)).toEqual([1000, 1300]);
    });
    it('counts decimals up to five', () => {
        expect(decimalsOf(4124.32)).toBe(2);
        expect(decimalsOf(1.08342)).toBe(5);
        expect(decimalsOf(1.0834212)).toBe(5);
        expect(decimalsOf(150)).toBe(0);
    });
});
