// The ICT strategy (src/pages/forex-trader/ict.ts, copied to api/_lib/ict.js by the build script).
// Candles here are made-up shapes, only to prove the RULES: sweep, structure shift, fair value gap, first return = entry, WAIT otherwise.
const { analyseIct } = require('../ict');

const M15 = 900;
const M5 = 300;
const E = 1704153600 + 20 * 3600;
const NOW = E + 20;

function walk(points, per) {
    const closes = [points[0]];
    for (let i = 1; i < points.length; i++) for (let k = 1; k <= per; k++) closes.push(points[i - 1] + ((points[i] - points[i - 1]) * k) / per);
    return closes;
}
function candlesFrom(closes, period, end, wick) {
    const n = closes.length;
    return closes.map((c, i) => {
        const o = i === 0 ? c : closes[i - 1];
        return { time: end - (n - i) * period, open: o, high: Math.max(o, c) + wick, low: Math.min(o, c) - wick, close: c };
    });
}
const flip = (cs, shift) => cs.map(c => ({ time: c.time, open: shift - c.open, high: shift - c.low, low: shift - c.high, close: shift - c.close }));

// M15: higher highs and higher lows = BULLISH (same shape as in mtf.spec.js)
const bullM15 = () => candlesFrom(walk([100, 110, 106, 116, 112, 122, 118, 126], 10), M15, E, 0.2);

// M5 before the sweep: zigzag with a swing low (123.2) and a swing high (124.2) right after it, then a small pullback.
const PRE = walk([124, 125, 124.2, 125, 124.2, 125, 124.2, 125, 124.2, 125, 124.2, 125, 124.2, 123.2, 124.2, 123.5], 5);
// explicit candles [open, high, low, close]
const SWEEP = [123.5, 123.7, 122.4, 123.3]; // goes below the swing low 122.9 and closes back above it
const PUSH = [123.3, 125.3, 123.3, 125.0]; // strong candle closing above the swing high 124.5: structure shift
const AFTER = [125.0, 125.5, 124.1, 125.3]; // its low 124.1 is above the SWEEP high 123.7: the gap is 123.7 - 124.1
const DRIFT = [125.3, 125.6, 124.9, 125.4];
const RETURN = [125.4, 125.45, 123.95, 124.3]; // comes back into the gap (low <= 124.1) and holds
const build = tail => {
    const closes = PRE;
    const pre = candlesFrom(closes, M5, E - tail.length * M5, 0.3);
    return [...pre, ...tail.map((t, i) => ({ time: E - (tail.length - i) * M5, open: t[0], high: t[1], low: t[2], close: t[3] }))];
};

describe('analyseIct', () => {
    test('sweep + structure shift + fair value gap, then the first return into the gap = BUY', () => {
        const r = analyseIct(bullM15(), build([SWEEP, PUSH, AFTER, DRIFT, RETURN]), NOW);
        expect(r.reasons.join(' | ')).toBeTruthy();
        expect(r.bias).toBe('bullish');
        expect(r.m5Status).toBe('confirmed');
        expect(r.signal).toBe('BUY');
        expect(r.plan.stopLoss).toBeLessThan(122.4); // beyond the sweep low
        expect(r.plan.takeProfit).toBeGreaterThan(r.plan.entry);
        expect(r.plan.rr).toBeGreaterThan(1.99);
        expect(r.signalTime).toBe(E);
        expect(r.m5Text).toMatch(/swept the low/);
        expect(r.m5Text).toMatch(/fair value gap/);
        expect(r.setupId).toMatch(/^ICT\|BUY\|[\d.]+\|[\d.]+$/);
    });

    test('the same picture upside down = SELL with mirrored, real numbers', () => {
        const up = analyseIct(bullM15(), build([SWEEP, PUSH, AFTER, DRIFT, RETURN]), NOW);
        const r = analyseIct(flip(bullM15(), 300), flip(build([SWEEP, PUSH, AFTER, DRIFT, RETURN]), 300), NOW);
        expect(r.signal).toBe('SELL');
        expect(r.plan.stopLoss).toBeGreaterThan(r.plan.entry);
        expect(r.plan.takeProfit).toBeLessThan(r.plan.entry);
        expect(r.m5Text).toMatch(/swept the high 17[0-9.]+/);
        expect(r.plan.risk).toBeCloseTo(up.plan.risk, 6);
    });

    test('swept and shifted, but price has not come back to the gap yet = WAIT (waiting for the return)', () => {
        const r = analyseIct(bullM15(), build([SWEEP, PUSH, AFTER, DRIFT]), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Status).toBe('waiting');
        expect(r.m5Text).toMatch(/Waiting for price to come back/);
    });

    test('swept, but no strong candle closed above the swing high = WAIT', () => {
        const weak = [123.3, 124.2, 123.3, 124.1]; // does not close above 124.5
        const r = analyseIct(bullM15(), build([SWEEP, weak, [124.1, 124.3, 123.9, 124.0]]), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Text).toMatch(/Waiting for a candle to close above/);
    });

    test('no sweep at all (price only climbs, no swing low is ever taken) = WAIT', () => {
        const climbing = candlesFrom(walk([118, 125], 70), M5, E, 0.1);
        const r = analyseIct(bullM15(), climbing, NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Text).toMatch(/no liquidity sweep/);
    });

    test('price closes through the gap = the setup failed = WAIT', () => {
        const through = [125.4, 125.45, 123.0, 123.4]; // closes below the gap bottom 123.7
        const r = analyseIct(bullM15(), build([SWEEP, PUSH, AFTER, DRIFT, through]), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Status).toBe('against');
    });

    test('the return happened a while ago, the entry has passed = WAIT', () => {
        const r = analyseIct(bullM15(), build([SWEEP, PUSH, AFTER, DRIFT, RETURN, DRIFT, DRIFT]), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.m5Status).toBe('stale');
    });

    test('no clear M15 direction = WAIT, whatever M5 does', () => {
        const choppy = candlesFrom(walk([100, 105, 101, 105.2, 100.8, 105, 101, 105, 100.9], 10), M15, E, 0.2);
        const r = analyseIct(choppy, build([SWEEP, PUSH, AFTER, DRIFT, RETURN]), NOW);
        expect(r.signal).toBe('WAIT');
        expect(r.plan).toBeNull();
    });

    test('too little or old data = WAIT, no crash', () => {
        expect(analyseIct([], [], NOW).signal).toBe('WAIT');
        expect(analyseIct(bullM15(), build([SWEEP, PUSH, AFTER, DRIFT, RETURN]), NOW + 3 * 3600).signal).toBe('WAIT');
    });

    test('the forming candle is ignored', () => {
        const cs = build([SWEEP, PUSH, AFTER, DRIFT, RETURN]);
        const forming = { time: E, open: 124.3, high: 130, low: 90, close: 100 };
        expect(analyseIct(bullM15(), [...cs, forming], E + 100).signal).toBe('BUY');
    });
});
