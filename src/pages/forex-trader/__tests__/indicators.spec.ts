import { bollinger, ema, heikinAshi, loadStudies, macd, rsi, sma } from '../indicators';

const mk = (closes: number[]) => closes.map((c, i) => ({ time: 1000 + i * 60, open: c, high: c + 1, low: c - 1, close: c }));

describe('indicators', () => {
    it('sma averages the last N closes and waits for enough history', () => {
        expect(sma(mk([1, 2, 3, 4, 5]), 3)).toEqual([null, null, 2, 3, 4]);
    });

    it('ema starts from the simple average and then follows the closes', () => {
        const out = ema(mk([1, 2, 3, 4, 5]), 3);
        expect(out.slice(0, 2)).toEqual([null, null]);
        expect(out[2]).toBe(2);
        expect(out[3]).toBeCloseTo(3, 10); // 4 * 0.5 + 2 * 0.5
        expect(out[4]).toBeCloseTo(4, 10);
    });

    it('bollinger bands are symmetric around the average and collapse when price is flat', () => {
        const flat = bollinger(mk(Array(25).fill(10)), 20, 2);
        expect(flat.upper[24]).toBe(10);
        expect(flat.lower[24]).toBe(10);
        const moving = bollinger(mk(Array.from({ length: 25 }, (_, i) => 10 + (i % 2))), 20, 2);
        const m = moving.mid[24] as number;
        expect((moving.upper[24] as number) - m).toBeCloseTo(m - (moving.lower[24] as number), 10);
        expect(moving.upper[24] as number).toBeGreaterThan(m);
    });

    it('rsi is 100 when price only rises, near 0 when it only falls, and null before enough history', () => {
        const up = rsi(mk(Array.from({ length: 30 }, (_, i) => 100 + i)), 14);
        expect(up[13]).toBeNull();
        expect(up[29]).toBe(100);
        const down = rsi(mk(Array.from({ length: 30 }, (_, i) => 100 - i)), 14);
        expect(down[29]).toBeCloseTo(0, 6);
    });

    it('macd is positive in a steady rise and its histogram is the line minus the signal', () => {
        const out = macd(mk(Array.from({ length: 80 }, (_, i) => 100 + i)));
        const last = out.line.length - 1;
        expect(out.line[last] as number).toBeGreaterThan(0);
        expect(out.hist[last] as number).toBeCloseTo((out.line[last] as number) - (out.signal[last] as number), 10);
        expect(out.line[10]).toBeNull();
    });

    it('heikin ashi closes at the average of open, high, low, close and opens at the middle of the last body', () => {
        const ha = heikinAshi([
            { time: 1, open: 10, high: 14, low: 8, close: 12 },
            { time: 2, open: 12, high: 16, low: 11, close: 15 },
        ]);
        expect(ha[0].close).toBe(11);
        expect(ha[0].open).toBe(11);
        expect(ha[1].open).toBe(11);
        expect(ha[1].close).toBe(13.5);
        expect(ha[1].high).toBe(16);
    });

    it('remembered choices fall back to plain candles with nothing on', () => {
        localStorage.clear();
        const s = loadStudies();
        expect(s.kind).toBe('candles');
        expect(Object.values(s.on).every(v => !v)).toBe(true);
        localStorage.setItem('epm_chart_studies', JSON.stringify({ kind: 'nonsense', on: { rsi: true } }));
        const t = loadStudies();
        expect(t.kind).toBe('candles');
        expect(t.on.rsi).toBe(true);
        expect(t.on.macd).toBe(false);
    });
});
