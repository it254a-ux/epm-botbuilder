/** @jest-environment node */
// Tests the Previous Day High / Low rejection (Institutional Footprint, Liquidity Sweep, Rejection Candle) with hand-built candles.
const { analysePreviousDay } = require('../pdh');

const NOW = Date.UTC(2026, 9, 13, 9, 30) / 1000; // 13 Oct 2026 09:30 GMT
const DAY = 86400;
const DAY_PREV = Date.UTC(2026, 9, 12) / 1000;
const DAY_TODAY = Date.UTC(2026, 9, 13) / 1000;

/** M15 candles: the whole previous day (high spike at `high`, low spike at `low`) plus today up to now. */
function m15({ high = 110, low = 90, prevDay = DAY_PREV, prevCount = 96, extra = [] } = {}) {
    const out = [];
    for (let i = 0; i < prevCount; i++) {
        out.push({ time: prevDay + i * 900, open: 100, close: 100.05, high: i === 40 ? high : 100.3, low: i === 70 ? low : 99.8 });
    }
    for (let t = DAY_TODAY; t + 900 <= NOW; t += 900) out.push({ time: t, open: 100, close: 100.05, high: 100.3, low: 99.8 });
    return [...extra, ...out].sort((a, b) => a.time - b.time);
}
/** M5 candles from [open, close, wickUp, wickDown] specs; the last one ends at `end`. */
const m5 = (specs, end = NOW) =>
    specs.map(([o, c, wu, wd], i) => ({ time: end - 300 * (specs.length - i), open: o, close: c, high: Math.max(o, c) + wu, low: Math.min(o, c) - wd }));

const QUIET = Array.from({ length: 45 }, () => [105, 105.05, 0.15, 0.15]);
const RUN = [[105, 106.2, 0.1, 0.1], [106.2, 107.4, 0.1, 0.1], [107.4, 108.6, 0.1, 0.1]]; // tall green candles: the Institutional Footprint
const TOUCH = [108.6, 109.8, 0.2, 0.1]; // reaches 110.0 = the Previous Day High
const REJECT = [109.8, 108.3, 0.1, 0.1]; // red, real body, closes below the touch candle's low (108.5)
const WATCH = [...QUIET, ...RUN, TOUCH];
const CONFIRMED = [...WATCH, REJECT];

const run = (specs, m15opts, now = NOW) => analysePreviousDay(m15(m15opts), m5(specs, now), now);
const flip = list => list.map(c => ({ time: c.time, open: 200 - c.open, high: 200 - c.low, low: 200 - c.high, close: 200 - c.close }));
const runFlipped = (specs, m15opts) => analysePreviousDay(flip(m15(m15opts)), flip(m5(specs)), NOW);

describe('the yesterday levels', () => {
    const r = run(WATCH);
    test('Previous Day High, Low and Equilibrium come from the last full day', () => {
        expect(r.levels).toMatchObject({ high: 110, low: 90, equilibrium: 100, day: DAY_PREV });
    });
    test('on a Monday the last full trading day is used (a thin Sunday is skipped)', () => {
        const monday = Date.UTC(2026, 9, 12) / 1000; // pretend "today" is Monday 12 Oct: Friday 9 Oct is the previous full day, Sunday has only 10 candles
        const fri = Date.UTC(2026, 9, 9) / 1000;
        const sun = Date.UTC(2026, 9, 11) / 1000;
        const now = monday + 9.5 * 3600;
        const candles = [];
        for (let i = 0; i < 96; i++) candles.push({ time: fri + i * 900, open: 100, close: 100.05, high: i === 40 ? 120 : 100.3, low: i === 70 ? 80 : 99.8 });
        for (let i = 0; i < 10; i++) candles.push({ time: sun + (88 + i) * 900, open: 100, close: 100.05, high: 101, low: 99, });
        for (let t = monday; t + 900 <= now; t += 900) candles.push({ time: t, open: 100, close: 100.05, high: 100.3, low: 99.8 });
        const res = analysePreviousDay(candles, m5(WATCH, now), now);
        expect(res.levels).toMatchObject({ high: 120, low: 80, day: fri });
    });
});

describe('WATCH: price touched the level, wait for the Rejection Candle', () => {
    const r = run(WATCH);
    test('stage, side and level', () => {
        expect(r.stage).toBe('watch');
        expect(r.side).toBe('SELL');
        expect(r.levelName).toBe('Previous Day High');
        expect(r.levelPrice).toBe(110);
        expect(r.plan).toBeNull();
        expect(r.rejection).toBeNull();
    });
    test('the footprint and the sweep are found', () => {
        expect(r.footprint.count).toBe(4); // 3 tall candles on the way + the touch candle
        expect(r.sweep).toMatchObject({ price: 110 });
    });
    test('the text tells the student not to enter yet', () => {
        expect(r.headline).toMatch(/^WATCH:.*Previous Day High.*Do NOT enter yet.*Rejection Candle/);
        expect(r.reasons.join(' ')).toMatch(/Wait for ONE red M5 candle/);
        expect(r.reasons.join(' ')).toMatch(/Institutional Footprint: 4 tall green M5 candles/);
        expect(r.reasons.join(' ')).toMatch(/Equilibrium 100/);
    });
    test('the chart gets named markers: footprint, sweep', () => {
        const kinds = r.markers.map(m => m.kind);
        expect(kinds.filter(k => k === 'footprint')).toHaveLength(4);
        expect(kinds).toContain('sweep');
        expect(kinds).not.toContain('rejection');
        expect(r.markers.find(m => m.kind === 'sweep').text).toBe('Liquidity Sweep');
        expect(r.markers.filter(m => m.kind === 'footprint' && m.text).map(m => m.text)).toEqual(['Institutional Footprint (4)']);
        expect(r.markers.every(m => m.above)).toBe(true); // at a high the arrows are drawn above the candles
    });
    test('one alert key per level per day (so the alert is sent once)', () => {
        expect(r.alertKey).toBe(`PDH|${DAY_TODAY}`);
    });
    test('a small red candle is not a Rejection Candle: still WATCH', () => {
        expect(run([...WATCH, [109.8, 109.7, 0.1, 0.1]]).stage).toBe('watch');
    });
    test('a red candle that does not close below the previous low is not a Rejection Candle: still WATCH', () => {
        expect(run([...WATCH, [109.9, 108.9, 0.05, 0.05]]).stage).toBe('watch');
    });
    test('a green candle never confirms', () => {
        expect(run([...WATCH, [109.8, 111, 0.1, 0.1]]).stage).toBe('watch');
    });
});

describe('CONFIRMED: the Rejection Candle formed', () => {
    const r = run(CONFIRMED);
    test('SELL at the Previous Day High', () => {
        expect(r.stage).toBe('confirmed');
        expect(r.side).toBe('SELL');
        expect(r.headline).toMatch(/^CONFIRMED SELL:.*Rejection Candle.*Previous Day High.*entry/);
        expect(r.rejection).toMatchObject({ close: 108.3 });
    });
    test('the trade plan: entry, stop beyond the sweep, Equilibrium and opposite level as targets', () => {
        const p = r.plan;
        expect(p.side).toBe('SELL');
        expect(p.entry).toBe(108.3);
        expect(p.stopLoss).toBeGreaterThan(110.0);
        expect(p.stopLoss).toBeLessThan(110.4);
        expect(p.takeProfit).toBe(100); // Target 1: Equilibrium
        expect(p.takeProfit2).toBe(90); // Target 2: Previous Day Low
        expect(p.rr).toBeCloseTo((108.3 - 100) / (p.stopLoss - 108.3), 6);
        expect(p.rr).toBeGreaterThan(2);
    });
    test('the arrows are named for teaching', () => {
        const rej = r.markers.find(m => m.kind === 'rejection');
        expect(rej.text).toBe('Rejection Candle: SELL');
        expect(rej.above).toBe(true);
    });
    test('the reasons explain each step', () => {
        const text = r.reasons.join(' ');
        for (const part of ['Previous Day High: 110', 'Institutional Footprint', 'touched the Previous Day High', 'Rejection Candle', 'Target 1 = Equilibrium 100', 'Target 2 = Previous Day Low 90']) expect(text).toContain(part);
    });
    test('the entry is the close of the LATEST closed candle, even if the Rejection Candle was 1-2 candles ago', () => {
        const later = run([...CONFIRMED, [108.3, 108.0, 0.1, 0.1]]);
        expect(later.stage).toBe('confirmed');
        expect(later.plan.entry).toBe(108.0);
        expect(later.rejection.close).toBe(108.3);
    });
    test('too late: more than 2 candles after the Rejection Candle the entry has passed', () => {
        const late = run([...CONFIRMED, [108.3, 108.2, 0.1, 0.1], [108.2, 108.1, 0.1, 0.1], [108.1, 108.0, 0.1, 0.1]]);
        expect(late.stage).toBe('none');
        expect(late.reasons.join(' ')).toMatch(/Rejection Candle formed 3 candles ago.*entry has already passed/);
        expect(late.plan).toBeNull();
        expect(late.markers.some(m => m.kind === 'rejection')).toBe(true); // still drawn so students can see what happened
    });
    test('chasing is not allowed: price already far below the Rejection Candle', () => {
        const chase = run([...CONFIRMED, [108.3, 106.5, 0.1, 0.1]]);
        expect(chase.stage).toBe('none');
        expect(chase.reasons.join(' ')).toMatch(/chasing is not allowed/);
    });
});

describe('price keeps running past the level: wait for the Rejection Candle', () => {
    const RUNNING = [...WATCH, [109.8, 111.0, 0.1, 0.1], [111.0, 112.2, 0.1, 0.1]];
    test('still WATCH while it runs up', () => {
        expect(run(RUNNING).stage).toBe('watch');
    });
    test('the red candle after the push up confirms the SELL, with the stop above the new high', () => {
        const r = run([...RUNNING, [112.2, 110.8, 0.1, 0.1]]);
        expect(r.stage).toBe('confirmed');
        expect(r.plan.entry).toBe(110.8);
        expect(r.plan.stopLoss).toBeGreaterThan(112.3); // beyond the highest point of the push (112.3)
        expect(r.plan.takeProfit).toBe(100);
    });
});

describe('PDL / BUY is the exact mirror', () => {
    test('watch', () => {
        const r = runFlipped(WATCH);
        expect(r.stage).toBe('watch');
        expect(r.side).toBe('BUY');
        expect(r.levelName).toBe('Previous Day Low');
        expect(r.levelPrice).toBe(90);
        expect(r.headline).toMatch(/Previous Day Low.*a green/);
        expect(r.reasons.join(' ')).toMatch(/Institutional Footprint: 4 tall red M5 candles/);
        expect(r.markers.every(m => !m.above)).toBe(true); // at a low the arrows are drawn below the candles
        expect(r.alertKey).toBe(`PDL|${DAY_TODAY}`);
        expect(r.sweep.price).toBe(90); // the lowest point reached, a real price (not flipped)
        expect(r.sweep.price).toBeGreaterThan(0);
    });
    test('confirmed: stop below, targets above', () => {
        const r = runFlipped(CONFIRMED);
        const sell = run(CONFIRMED);
        expect(r.stage).toBe('confirmed');
        expect(r.side).toBe('BUY');
        expect(r.plan.stopLoss).toBeLessThan(r.plan.entry);
        expect(r.plan.takeProfit).toBeGreaterThan(r.plan.entry);
        expect(r.plan.entry).toBeCloseTo(200 - sell.plan.entry, 6);
        expect(r.plan.stopLoss).toBeCloseTo(200 - sell.plan.stopLoss, 6);
        expect(r.plan.takeProfit).toBeCloseTo(200 - sell.plan.takeProfit, 6);
        expect(r.plan.takeProfit2).toBeCloseTo(110, 6); // Target 2: Previous Day High
        expect(r.plan.rr).toBeCloseTo(sell.plan.rr, 6);
        expect(r.markers.find(m => m.kind === 'rejection').text).toBe('Rejection Candle: BUY');
    });
    test('every scenario gives the mirrored answer', () => {
        const cases = [WATCH, CONFIRMED, [...WATCH, [109.8, 109.7, 0.1, 0.1]], [...CONFIRMED, [108.3, 108.0, 0.1, 0.1]], [...CONFIRMED, [108.3, 106.5, 0.1, 0.1]]];
        for (const c of cases) {
            const a = run(c);
            const b = runFlipped(c);
            expect(b.stage).toBe(a.stage);
            expect(b.side).toBe(a.side === 'SELL' ? 'BUY' : a.side);
        }
    });
});

describe('no setup', () => {
    test('price has not touched the level', () => {
        const r = run([...QUIET, ...RUN]);
        expect(r.stage).toBe('none');
        expect(r.reasons.join(' ')).toMatch(/has not touched the Previous Day High/);
        expect(r.plan).toBeNull();
        expect(r.markers).toEqual([]);
    });
    test('a touch without an Institutional Footprint is not a setup', () => {
        const creep = Array.from({ length: 30 }, (_, i) => [105 + i * 0.16, 105.16 + i * 0.16, 0.1, 0.1]);
        const r = run([...QUIET, ...creep, [109.8, 110.0, 0.1, 0.1]].slice(-60));
        expect(r.stage).toBe('none');
        expect(r.reasons.join(' ')).toMatch(/tall green candles? came with it \(at least 2 are needed/);
    });
    test('price left the area without a Rejection Candle: the setup is over', () => {
        const drift = Array.from({ length: 8 }, (_, i) => [109.8 - i * 0.4, 109.6 - i * 0.4, 0.05, 0.05]);
        const r = run([...WATCH, ...drift]);
        expect(r.stage).toBe('none');
        expect(r.reasons.join(' ')).toMatch(/left the Previous Day High area without a Rejection Candle/);
    });
    test('a touch more than 36 candles ago is no longer live', () => {
        const flat = Array.from({ length: 40 }, () => [105, 105.05, 0.15, 0.15]);
        const r = run([...QUIET.slice(0, 20), ...RUN, TOUCH, ...flat]);
        expect(r.stage).toBe('none');
    });
    test('the reward must be at least 1:2: a narrow previous day gives no trade', () => {
        const r = run(CONFIRMED, { high: 110, low: 106 }); // Equilibrium 108 is right at the entry, reward far too small
        expect(r.stage).toBe('none');
        expect(r.reasons.join(' ')).toMatch(/Equilibrium|reward of only/);
        expect(r.plan).toBeNull();
    });
    test('a candle that is still forming can never confirm', () => {
        const forming = { time: NOW - 300 + 0, open: 109.8, high: 109.9, low: 108.2, close: 108.3 };
        const closed = m5(WATCH, NOW - 300); // closed candles end 5 minutes before "now"... plus a forming rejection candle starting at that moment
        const r = analysePreviousDay(m15(), [...closed, { ...forming, time: NOW - 300 }], NOW - 300 + 60);
        expect(r.stage).toBe('watch');
    });
});

describe('bad or missing data is never turned into a setup', () => {
    const expectProblem = (r, text) => {
        expect(r.stage).toBe('none');
        expect(r.plan).toBeNull();
        expect(r.dataProblem).toMatch(text);
        expect(r.reasons.join(' ')).toMatch(/without reliable data/);
        expect(r.signalTime).toBeNull();
    };
    test('too few M5 or M15 candles', () => {
        expectProblem(analysePreviousDay(m15(), m5(CONFIRMED).slice(-20), NOW), /Not enough closed M5 candles \(20, need 40\)/);
        expectProblem(analysePreviousDay(m15().slice(-30), m5(CONFIRMED), NOW), /Not enough closed M15 candles/);
    });
    test('stale data (feed stopped or market closed)', () => {
        expectProblem(analysePreviousDay(m15(), m5(CONFIRMED), NOW + 3600), /stale/);
    });
    test('bad numbers are dropped, not trusted', () => {
        const list = m5(CONFIRMED);
        list[10] = { ...list[10], close: NaN };
        const r = analysePreviousDay(m15(), list, NOW);
        expect(r.stage).toBe('confirmed'); // one bad candle removed, the rest is fine
    });
    test('no previous trading day in the data', () => {
        const onlyToday = m15().filter(c => c.time >= DAY_TODAY);
        const r = analysePreviousDay([...onlyToday, ...onlyToday.map(c => ({ ...c, time: c.time + 0.5 }))].slice(0, 60).concat(onlyToday), m5(CONFIRMED), NOW);
        expect(r.stage).toBe('none');
        expect(r.plan).toBeNull();
    });
    test('it never throws, whatever it is given', () => {
        for (const args of [[undefined, undefined], [null, 'x'], [[{}], [{}]], [[null], [null]], ['a', 5], [m15(), [{ time: 'x' }]]]) {
            expect(() => analysePreviousDay(args[0], args[1], NOW)).not.toThrow();
            expect(analysePreviousDay(args[0], args[1], NOW).stage).toBe('none');
        }
    });
    test('prices passed in are never changed', () => {
        const a = m15().map(Object.freeze); const b = m5(CONFIRMED).map(Object.freeze);
        Object.freeze(a); Object.freeze(b);
        expect(analysePreviousDay(a, b, NOW)).toEqual(run(CONFIRMED));
    });
});

describe('failed second push (top, pullback, lower high, red candle)', () => {
    const TOP = [...QUIET, ...RUN, TOUCH];
    const PULL = [[109.8, 108.3, 0.1, 0.1], [108.3, 106.8, 0.1, 0.1], [106.8, 106.0, 0.1, 0.1]];
    const PUSH = [[106.0, 107.2, 0.1, 0.1], [107.2, 108.4, 0.1, 0.1]]; // high 108.5, below the top 110.0
    const SELL = [108.4, 106.9, 0.1, 0.1];
    test('waits for the red candle after the lower high', () => {
        const r = run([...TOP, ...PULL, ...PUSH]);
        expect(r.stage).toBe('watch');
        expect(r.pattern).toBe('second');
    });
    test('confirms SELL with the stop above the lower high', () => {
        const r = run([...TOP, ...PULL, ...PUSH, SELL]);
        expect(r.stage).toBe('confirmed');
        expect(r.side).toBe('SELL');
        expect(r.pattern).toBe('second');
        expect(r.plan.stopLoss).toBeGreaterThan(108.5);
        expect(r.plan.stopLoss).toBeLessThan(110);
    });
    test('mirror at the Previous Day Low gives BUY', () => {
        const r = runFlipped([...TOP, ...PULL, ...PUSH, SELL]);
        expect(r.stage).toBe('confirmed');
        expect(r.side).toBe('BUY');
    });
    test('a new high above the top cancels the second-push setup', () => {
        const r = run([...TOP, ...PULL, ...PUSH, [108.4, 110.6, 0.1, 0.1], SELL]);
        expect(r.pattern === 'second' && r.stage === 'confirmed').toBe(false);
    });
});
