// The M15 + M5 multi-timeframe analysis (src/pages/forex-trader/mtf.ts, copied to api/_lib/mtf.js by the build script).
// Candles here are made-up shapes, only to prove the RULES: direction from M15, confirmation from M5, WAIT otherwise.
const { analyseMtf, cleanClosed, pivots } = require('../mtf');

const M15 = 900;
const M5 = 300;
const E = 1704153600 + 20 * 3600; // end of the last candle: 2024-01-02 20:00 UTC (same UTC day as the first candle)
const NOW = E + 20;

/** Close prices that walk straight from point to point, `per` candles per leg. */
function walk(points, per) {
    const closes = [points[0]];
    for (let i = 1; i < points.length; i++) for (let k = 1; k <= per; k++) closes.push(points[i - 1] + ((points[i] - points[i - 1]) * k) / per);
    return closes;
}
/** Turns closes into candles that END at `end`; `wick` is added above and below. */
function candlesFrom(closes, period, end, wick) {
    const n = closes.length;
    return closes.map((c, i) => {
        const o = i === 0 ? c : closes[i - 1];
        return { time: end - (n - i) * period, open: o, high: Math.max(o, c) + wick, low: Math.min(o, c) - wick, close: c };
    });
}
const flip = (cs, shift) => cs.map(c => ({ time: c.time, open: shift - c.open, high: shift - c.low, low: shift - c.high, close: shift - c.close }));

// M15: higher highs (110,116,122) and higher lows (106,112,118), price 126 above the last low: BULLISH.
const bullM15 = () => candlesFrom(walk([100, 110, 106, 116, 112, 122, 118, 126], 10), M15, E, 0.2);
// M5: ... up to the swing high 125, a pullback to 124, then two closes above 125 (the confirmation).
const PRE = walk([118.5, 120.5], 12).slice(0, -1);
const buyM5Closes = () => [...PRE, ...walk([121, 122, 121.5, 123, 122.4, 124, 123.5, 125], 6), ...walk([125, 124], 6).slice(1), ...walk([124, 125.4], 8).slice(1)];
const bullM5 = (closes = buyM5Closes()) => candlesFrom(closes, M5, E, 0.15);

describe('analyseMtf', () => {
    test('M15 bullish + M5 break above the swing high after a pullback = BUY with real levels', () => {
        const r = analyseMtf(bullM15(), bullM5(), NOW);
        expect(r.bias).toBe('bullish');
        expect(r.m5Status).toBe('confirmed');
        expect(r.signal).toBe('BUY');
        expect(r.plan.stopLoss).toBeLessThan(r.plan.entry);
        expect(r.plan.takeProfit).toBeGreaterThan(r.plan.entry);
        expect(r.plan.rr).toBeGreaterThanOrEqual(2);
        expect(r.plan.stopLoss).toBeLessThan(124); // beyond the pullback low
        expect(r.signalTime).toBe(E); // the close of the confirming (last) candle
        expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    });

    test('the same picture upside down = SELL, with the same rules and mirrored numbers', () => {
        const r = analyseMtf(flip(bullM15(), 300), flip(bullM5(), 300), NOW);
        expect(r.bias).toBe('bearish');
        expect(r.signal).toBe('SELL');
        expect(r.plan.stopLoss).toBeGreaterThan(r.plan.entry);
        expect(r.plan.takeProfit).toBeLessThan(r.plan.entry);
        expect(r.m5Text).toMatch(/^M5 confirmed: pullback high 17[0-9.]+/); // real (not flipped) numbers are shown
        const b = analyseMtf(bullM15(), bullM5(), NOW);
        expect(r.plan.risk).toBeCloseTo(b.plan.risk, 6);
        expect(r.plan.rr).toBeCloseTo(b.plan.rr, 6);
    });

    test('no clear M15 structure = WAIT, whatever M5 does', () => {
        const choppy = candlesFrom(walk([100, 105, 101, 105.2, 100.8, 105, 101, 105, 100.9], 10), M15, E, 0.2);
        const r = analyseMtf(choppy, bullM5(), NOW);
        expect(r.bias).toBe('unclear');
        expect(r.signal).toBe('WAIT');
        expect(r.plan).toBeNull();
    });

    test('M5 contradicts M15 (new lower low after the pullback) = WAIT', () => {
        const closes = [...PRE, ...walk([121, 122, 121.5, 123, 122.4, 124, 123.5, 125], 6), ...walk([125, 124], 6).slice(1), ...walk([124, 123], 4).slice(1)];
        const r = analyseMtf(bullM15(), bullM5(closes), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Status).toBe('against');
    });

    test('pullback found but no candle has closed above the swing high yet = WAIT', () => {
        const closes = [...PRE, ...walk([121, 122, 121.5, 123, 122.4, 124, 123.5, 125], 6), ...walk([125, 124], 6).slice(1), ...walk([124, 124.6], 6).slice(1)];
        const r = analyseMtf(bullM15(), bullM5(closes), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Status).toBe('waiting');
    });

    test('the break happened a while ago: the entry has passed = WAIT', () => {
        const closes = [...buyM5Closes(), 125.4, 125.4, 125.4, 125.4];
        const r = analyseMtf(bullM15(), bullM5(closes), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Status).toBe('stale');
    });

    test('a candle that is still forming is never used for confirmation', () => {
        const base = bullM5([...PRE, ...walk([121, 122, 121.5, 123, 122.4, 124, 123.5, 125], 6), ...walk([125, 124], 6).slice(1), ...walk([124, 124.6], 6).slice(1)]);
        const forming = { time: E, open: 124.6, high: 126, low: 124.5, close: 125.9 }; // would confirm, but E + 300 > NOW
        const r = analyseMtf(bullM15(), [...base, forming], NOW);
        expect(r.signal).toBe('WAIT');
    });

    test('not enough room before the next M15 level = WAIT (and it says why)', () => {
        // an M15 swing high at 126.5 sits only a little above the price (1 : 2 is impossible)
        const m15 = candlesFrom(walk([100, 110, 106, 116, 112, 122, 118, 126.5, 125.9], 10).slice(0, 79).concat([]), M15, E, 0.2);
        const r = analyseMtf(m15, bullM5(), NOW);
        expect(r.bias).toBe('bullish');
        expect(r.signal).toBe('WAIT');
        expect(r.reasons.join(' ')).toMatch(/Not enough room/);
    });

    test('target = the next M15 resistance when it is far enough', () => {
        const m15 = candlesFrom(walk([100, 110, 106, 116, 112, 122, 118, 135, 126], 10), M15, E, 0.2);
        const r = analyseMtf(m15, bullM5(), NOW);
        expect(r.signal).toBe('BUY');
        expect(r.levels.resistance).toBe(135.2);
        expect(r.plan.takeProfit).toBe(135.2);
    });

    test('old data, too little data, bad candles = WAIT, nothing invented', () => {
        expect(analyseMtf(bullM15(), bullM5(), NOW + 3 * 3600).signal).toBe('WAIT');
        expect(analyseMtf(bullM15().slice(-20), bullM5(), NOW).signal).toBe('WAIT');
        expect(analyseMtf([], [], NOW).signal).toBe('WAIT');
        const bad = bullM5();
        bad[10] = { ...bad[10], high: NaN };
        expect(() => analyseMtf(bullM15(), bad, NOW)).not.toThrow();
    });
});

describe('helpers', () => {
    test('cleanClosed sorts, removes duplicates and the forming candle', () => {
        const a = { time: 0, open: 1, high: 2, low: 0, close: 1 };
        const out = cleanClosed([{ ...a, time: 600 }, a, { ...a, time: 300 }, { ...a, time: 300, close: 1.5 }, { ...a, time: 900 }], 300, 1200);
        expect(out.map(c => c.time)).toEqual([0, 300, 600, 900]);
        expect(out[1].close).toBe(1.5);
        expect(cleanClosed([a], 300, 100)).toEqual([]);
    });
    test('pivots needs strictly higher/lower neighbours on both sides', () => {
        const mk = hs => hs.map((h, i) => ({ time: i, open: h, high: h, low: h - 1, close: h }));
        expect(pivots(mk([1, 2, 5, 2, 1]), 'high', 2).map(p => p.price)).toEqual([5]);
        expect(pivots(mk([1, 2, 5, 5, 1]), 'high', 2).map(p => p.index)).toEqual([2]); // a flat top counts once
        expect(pivots(mk([1, 5, 2, 5, 1]), 'high', 2)).toEqual([]);
    });
});
