/** @jest-environment node */
// Tests the liquidity-grab (stop-hunt) strategy with hand-built M5 candles.
const { analyseGrab } = require('../grab');

const NOW = Date.UTC(2026, 9, 13, 9, 30) / 1000; // 13 Oct 2026 09:30 GMT
const DAY_PREV = Date.UTC(2026, 9, 12) / 1000;
const DAY_TODAY = Date.UTC(2026, 9, 13) / 1000;

const quiet = (t, p = 105) => ({ time: t, open: p, close: p + 0.05, high: p + 0.2, low: p - 0.2 });
const spec = ([o, c, wu, wd], time) => ({ time, open: o, close: c, high: Math.max(o, c) + wu, low: Math.min(o, c) - wd });

/** Previous day (high spike `pdh`, low spike 90) + today's quiet candles, then the scenario at the very end. */
function build(scenario, { pdh = 110, end = NOW } = {}) {
    const out = [];
    for (let i = 0; i < 288; i++) out.push({ time: DAY_PREV + i * 300, open: 100, close: 100.05, high: i === 100 ? pdh : 100.3, low: i === 150 ? 90 : 99.8 });
    const startScenario = end - 300 * scenario.length;
    for (let t = DAY_TODAY; t < startScenario; t += 300) out.push(quiet(t));
    scenario.forEach((s, i) => out.push(spec(s, startScenario + i * 300)));
    return out;
}

const RUN = [[105, 106.2, 0.1, 0.1], [106.2, 107.4, 0.1, 0.1], [107.4, 108.6, 0.1, 0.1]]; // tall green candles: the Institutional Footprint
const SWEEP = [108.6, 109.8, 0.3, 0.1]; // high 110.1, above the Previous Day High 110
const PULL = [[109.8, 108.4, 0.1, 0.1], [108.4, 107.2, 0.1, 0.1]];
const BACK = [[107.2, 108.5, 0.1, 0.1], [108.5, 109.6, 0.1, 0.1]];
const BASE = [...RUN, SWEEP, ...PULL, ...BACK];

/** A candle that reaches `line` with `share` of its height beyond it, closing `closeAt`. */
function touch(line, share, closeAt) {
    const low = 109.3;
    const high = (line - share * low) / (1 - share);
    return [109.6, closeAt ?? line - 0.1, high - Math.max(109.6, closeAt ?? line - 0.1), Math.min(109.6, closeAt ?? line - 0.1) - low];
}
const flip = list => list.map(c => ({ time: c.time, open: 200 - c.open, high: 200 - c.low, low: 200 - c.high, close: 200 - c.close }));

const stopLineOf = opts => {
    const r = analyseGrab(build(BASE, opts), NOW);
    return r.stopLine;
};

describe('the Previous Day High is taken, then the stop-hunt line is touched', () => {
    const line = stopLineOf();
    test('the stop-hunt line sits just above the first extreme', () => {
        expect(line).toBeGreaterThan(110.1);
        expect(line).toBeLessThan(110.1 + 1);
    });
    test('a short touch that closes back below the line is a SELL signal', () => {
        const r = analyseGrab(build([...BASE, touch(line, 0.1)]), NOW);
        expect(r.stage).toBe('signal');
        expect(r.side).toBe('SELL');
        expect(r.levelName).toBe('Previous Day High');
        expect(r.footprint.count).toBeGreaterThanOrEqual(2);
        expect(r.entry).toBeCloseTo(line - 0.1, 5);
        expect(r.touch.overshootShare).toBeLessThanOrEqual(0.25);
        expect(r.setupId).toMatch(/^pd\|SELL\|/);
    });
    test('a long spike through the line (more than 25% of the candle beyond it) sends nothing', () => {
        const r = analyseGrab(build([...BASE, touch(line, 0.5)]), NOW);
        expect(r.stage).toBe('none');
    });
    test('a candle that closes beyond the line sends nothing (price is accepted there)', () => {
        const r = analyseGrab(build([...BASE, touch(line, 0.1, line + 0.5)]), NOW);
        expect(r.stage).toBe('none');
    });
    test('a candle that stops short of the line sends nothing', () => {
        const r = analyseGrab(build([...BASE, touch(line - 0.6, 0.0)]), NOW);
        expect(r.stage).toBe('none');
    });
    test('no pullback first: nothing is sent', () => {
        const r = analyseGrab(build([...RUN, SWEEP, [109.8, 109.6, 0.5, 0.1]]), NOW);
        expect(r.stage).not.toBe('signal');
    });
    test('without an Institutional Footprint nothing is sent', () => {
        const small = [[105, 105.3, 0.1, 0.1], [105.3, 105.6, 0.1, 0.1], [105.6, 105.9, 0.1, 0.1]];
        const r = analyseGrab(build([...small, SWEEP, ...PULL, ...BACK, touch(line, 0.1)]), NOW);
        expect(r.stage).toBe('none');
    });
    test('an old touch is too late', () => {
        const r = analyseGrab(build([...BASE, touch(line, 0.1), [109, 108.9, 0.1, 0.1], [108.9, 108.8, 0.1, 0.1], [108.8, 108.7, 0.1, 0.1]]), NOW);
        expect(r.stage).toBe('none');
    });
    test('the mirror case, a Previous Day Low taken, gives a BUY', () => {
        const r = analyseGrab(flip(build([...BASE, touch(line, 0.1)])), NOW);
        expect(r.stage).toBe('signal');
        expect(r.side).toBe('BUY');
        expect(r.levelName).toBe('Previous Day Low');
        // the line is measured from the first extreme with the candle size of that moment, so it is close to the mirrored line
        expect(Math.abs(r.stopLine - (200 - line))).toBeLessThan(0.1);
    });
});

describe("today's own extreme (no previous-day level involved)", () => {
    const FAR = { pdh: 130 };
    const line = analyseGrab(build(BASE, FAR), NOW).stopLine;
    test('after the extreme, a pullback and a pullback-less state, only a heads-up is possible', () => {
        const r = analyseGrab(build(BASE, FAR), NOW);
        expect(r.stage).toBe('watch');
        expect(r.kind).toBe('today');
        expect(r.alertKey).toMatch(/^grab-watch\|today\|SELL\|/);
    });
    test('the touch gives a signal with the right labels', () => {
        const r = analyseGrab(build([...BASE, touch(line, 0.1)], FAR), NOW);
        expect(r.stage).toBe('signal');
        expect(r.kind).toBe('today');
        expect(r.markers.map(m => m.kind)).toEqual(expect.arrayContaining(['footprint', 'sweep', 'pullback', 'touch']));
    });
});

describe('data problems never produce a setup', () => {
    test('too few candles', () => {
        expect(analyseGrab(build(BASE).slice(0, 40), NOW).dataProblem).toBeTruthy();
    });
    test('stale data', () => {
        expect(analyseGrab(build(BASE), NOW + 3600).stage).toBe('none');
    });
    test('garbage input does not throw', () => {
        expect(() => analyseGrab(null, NOW)).not.toThrow();
        expect(analyseGrab(undefined, NOW).stage).toBe('none');
    });
});
