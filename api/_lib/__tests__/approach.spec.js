const approach = require('../approach');
const chart = require('../signal-chart');

// three days of 5-minute candles, ending at 12:02 UTC
const TF = 300;
const NOW = Date.UTC(2026, 10, 10, 12, 2, 0) / 1000;
function candles() {
    const start = Math.floor(NOW / 86400) * 86400 - 2 * 86400;
    const out = [];
    let prev = 4100;
    for (let t = start; t < NOW; t += TF) {
        const day = Math.floor((t - start) / 86400);
        const close = 4100 + Math.sin(t / 3000) * 6 + (day === 1 ? 10 * Math.sin(t / 20000) : 0) + Math.sin(t / 300) * 0.8;
        out.push({ time: t, open: prev, high: Math.max(prev, close) + 0.6, low: Math.min(prev, close) - 0.6, close });
        prev = close;
    }
    return out;
}

const fakeStore = () => {
    const claimed = new Set();
    return {
        claimed,
        claimAlert: async (_s, k) => (claimed.has(k) ? false : (claimed.add(k), true)),
        releaseAlert: async (_s, k) => void claimed.delete(k),
    };
};

describe('approaching the SL lines', () => {
    it('finds the same two SL lines the chart draws, and says which one price is near', () => {
        const far = approach.findApproach(candles(), 'forex', NOW, { atrFraction: 0 });
        expect(far.lines.map(l => l.side)).toEqual(['SELL', 'BUY']);
        expect(far.lines[0].level).toBeGreaterThan(far.price); // Sell SL is above price
        expect(far.lines[1].level).toBeLessThan(far.price); // Buy SL is below price
        expect(far.lines.every(l => !l.near)).toBe(true); // price has not touched the Previous Day High or Low yet
        const close = approach.findApproach(candles(), 'forex', NOW, { atrFraction: 8 });
        expect(close.lines.map(l => l.near)).toEqual([true, false]); // asked to warn 8 candles' worth early: only the High is that close
    });

    it('alerts the moment price touches the Previous Day High or Low, even if only a thin wick did, and not before', () => {
        const base = candles();
        const found0 = approach.findApproach(base, 'forex', NOW, { atrFraction: 0 });
        const high = found0.lines[0].edge;
        const low = found0.lines[1].edge;
        const last = base[base.length - 1];
        // a wick that just reaches the Previous Day High
        const wick = base.slice(0, -1).concat([{ ...last, high: high + 0.01 }]);
        const up = approach.findApproach(wick, 'forex', NOW, { atrFraction: 0 });
        expect(up.lines.map(l => l.near)).toEqual([true, false]);
        expect(up.lines[0].distance).toBeGreaterThan(0); // still short of the SL line itself
        // a wick that only gets close does not count
        const shy = base.slice(0, -1).concat([{ ...last, high: high - 0.5 }]);
        expect(approach.findApproach(shy, 'forex', NOW, { atrFraction: 0 }).lines.map(l => l.near)).toEqual([false, false]);
        // the Previous Day Low
        const down = base.slice(0, -1).concat([{ ...last, low: low - 0.01 }]);
        expect(approach.findApproach(down, 'forex', NOW, { atrFraction: 0 }).lines.map(l => l.near)).toEqual([false, true]);
        // a touch a couple of candles ago (between two runs) still counts
        const earlier = base.slice(0, -3).concat([{ ...base[base.length - 3], high: high + 0.01 }], base.slice(-2));
        expect(approach.findApproach(earlier, 'forex', NOW, { atrFraction: 0 }).lines[0].near).toBe(true);
    });

    it('does nothing when there are too few candles', () => {
        expect(approach.findApproach(candles().slice(-10), 'forex', NOW, { atrFraction: 4 })).toBeNull();
    });

    it('the message names the line, the price and the distance, and says nothing was traded', () => {
        const found = approach.findApproach(candles(), 'forex', NOW, { atrFraction: 8 });
        const text = approach.formatApproach(found, found.lines[0], 'Gold/USD', { siteUrl: 'https://example.test/' });
        expect(text).toContain('touched the Prev Day High');
        expect(text).toContain('about to reach the <b>Sell SL line');
        expect(text).toContain('Gold/USD');
        expect(text).toContain('Sniper');
        expect(text).toContain('nothing has been traded');
        expect(text).toContain('https://example.test/');
        const reached = { ...found.lines[0], distance: -0.4 };
        expect(approach.formatApproach(found, reached, 'Gold/USD')).toContain('has reached the <b>Sell SL line');
    });

    it('the chart picture can be drawn from the plan that goes with a line', () => {
        const found = approach.findApproach(candles(), 'forex', NOW, { atrFraction: 8 });
        const sig = { ...found.lines[0].plan, symbol: 'frxXAUUSD', symbolName: 'Gold/USD', timeframe: 300, time: found.closed[found.closed.length - 1].time };
        const svg = chart.buildChartSvg({ candles: found.closed, analysis: found.analysis, signal: sig });
        expect(svg).toContain('<svg');
    });

    it('sends each near line once per day, sends nothing in a dry run, and gives the alert back when Telegram refuses', async () => {
        const store = fakeStore();
        const sent = [];
        const base = { symbol: 'frxXAUUSD', symbolName: 'Gold/USD', kind: 'forex', c5: candles(), now: NOW, cfg: { atrFraction: 8 } };
        const deps = write => ({ sql: {}, write, store, send: fn => fn(), deliver: async text => void sent.push(text), siteUrl: '' });

        const dry = await approach.runApproach({ ...base, deps: deps(false) });
        expect(dry.wouldSend).toHaveLength(1);
        expect(sent).toHaveLength(0);
        expect(store.claimed.size).toBe(0);

        const first = await approach.runApproach({ ...base, deps: deps(true) });
        expect(first.sent).toEqual(['SELL']);
        expect(sent).toHaveLength(1);
        const second = await approach.runApproach({ ...base, deps: deps(true) });
        expect(second.sent).toBeUndefined();
        expect(second.skipped).toEqual(['SELL: already sent today']);
        expect(sent).toHaveLength(1);

        const store2 = fakeStore();
        const failing = { sql: {}, write: true, store: store2, send: fn => fn(), deliver: async () => { throw new Error('telegram down'); }, siteUrl: '' };
        const bad = await approach.runApproach({ ...base, deps: failing });
        expect(bad.sent[0]).toMatch(/failed/);
        expect(store2.claimed.size).toBe(0); // given back, so the next run tries again
    });

    it('can be switched off', () => {
        expect(approach.readApproachConfig({ APPROACH_ALERT: 'off' }).enabled).toBe(false);
        expect(approach.readApproachConfig({}).enabled).toBe(true);
        expect(approach.readApproachConfig({}).atrFraction).toBe(0);
        expect(approach.readApproachConfig({ APPROACH_ATR: '2' }).atrFraction).toBe(2);
    });
});
