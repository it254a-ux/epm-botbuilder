import { analyseVolumeProfile } from '../volume-profile';
import type { Candle } from '../engine';

/** A path through the given prices, one candle per step (small wicks so swings are clear). */
function path(points: number[], perLeg = 6, start = 1_700_000_000, step = 900): Candle[] {
    const out: Candle[] = [];
    let t = start;
    let prev = points[0];
    for (let p = 1; p < points.length; p++) {
        for (let k = 1; k <= perLeg; k++) {
            const close = points[p - 1] + ((points[p] - points[p - 1]) * k) / perLeg;
            out.push({ time: t, open: prev, high: Math.max(prev, close) + 0.3, low: Math.min(prev, close) - 0.3, close });
            prev = close;
            t += step;
        }
    }
    return out;
}
const flat = (n: number, price: number): Candle[] =>
    Array.from({ length: n }, (_, i) => ({ time: 1_699_000_000 + i * 900, open: price, high: price + 0.6, low: price - 0.6, close: price }));
const shift = (cs: Candle[], to: number): Candle[] => cs.map((c, i) => ({ ...c, time: to + i * 900 }));

describe('Volume profile strategy', () => {
    // rising swings: 100 -> 120 -> 112 -> 135 -> 125 -> 150 (higher highs and higher lows), then a pullback to the middle of the last leg
    const up = [...flat(40, 100), ...shift(path([100, 120, 112, 135, 125, 150, 138]), 1_699_100_000)];

    it('reads a rising market as BUY and draws the leg, the POC and the pullback area', () => {
        const a = analyseVolumeProfile(up, 'forex');
        expect(a.smc !== null && a.smc !== undefined).toBe(true);
        expect(a.smc?.side).toBe('BUY');
        expect(a.smc?.noHistory).toBe(true);
        expect(a.smc?.poc !== null).toBe(true);
        const poc = a.smc?.poc?.price ?? 0;
        expect(poc > (a.smc?.bos.price ?? 0)).toBe(true);
        expect(poc < (a.smc?.target.price ?? 0)).toBe(true);
    });

    it('a falling market is a SELL, the exact mirror', () => {
        const down = up.map(c => ({ time: c.time, open: 300 - c.open, high: 300 - c.low, low: 300 - c.high, close: 300 - c.close }));
        const a = analyseVolumeProfile(down, 'forex');
        expect(a.smc?.side).toBe('SELL');
        expect(Math.abs((a.smc?.poc?.price ?? 0) - (300 - (analyseVolumeProfile(up, 'forex').smc?.poc?.price ?? 0))) < 1e-6).toBe(true);
    });

    it('waits when there are too few candles', () => {
        expect(analyseVolumeProfile(up.slice(0, 20), 'forex').state).toBe('no_data');
    });
});
