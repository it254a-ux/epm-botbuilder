const { readGrabConfig, targets, formatGrabSignal, formatGrabWatch } = require('../grab-telegram');
const { buildGrabChartSvg } = require('../signal-chart-grab');

const cfg = { multiplier: 100, tpMultiple: 2, maxOvershoot: 0.25, cooldownMin: 30 };
const result = side => ({
    stage: 'signal', side, kind: 'asian', levelName: side === 'SELL' ? 'Asian High' : 'Asian Low', levelPrice: 100,
    extreme: { time: 1700000000, price: 101 }, stopLine: 101.25, pullback: { time: 1700000600, price: 99.5 },
    footprint: { count: 2, times: [1699999400, 1699999700], giant: false },
    touch: { time: 1700001200, high: 101.3, low: 100.6, close: 101.1, overshootShare: 0.07 }, entry: 101.1, atr: 0.5,
});

describe('grab telegram', () => {
    it('reads defaults and env overrides', () => {
        expect(readGrabConfig({})).toMatchObject({ multiplier: 100, tpMultiple: 2 });
        expect(readGrabConfig({ GRAB_MULTIPLIER: '50', GRAB_TP_STAKES: '3' })).toMatchObject({ multiplier: 50, tpMultiple: 3 });
    });
    it('computes TP and stop-out prices both ways', () => {
        const s = targets('SELL', 100, cfg);
        expect(s.tpPrice).toBeCloseTo(98, 6);
        expect(s.stopOutPrice).toBeCloseTo(101, 6);
        const b = targets('BUY', 100, cfg);
        expect(b.tpPrice).toBeCloseTo(102, 6);
        expect(b.stopOutPrice).toBeCloseTo(99, 6);
    });
    it('signal text states no stop loss and 2x stake', () => {
        const t = formatGrabSignal(result('SELL'), 'Gold/USD', cfg, {});
        expect(t).toContain('SELL');
        expect(t).toContain('No stop loss');
        expect(t).toContain('2× your stake');
    });
    it('watch text says do not enter', () => {
        const t = formatGrabWatch(result('BUY'), 'BTC/USD', {});
        expect(t).toContain('Do NOT enter');
    });
    it('draws a labelled chart svg for both sides', () => {
        const candles = [];
        for (let i = 0; i < 120; i++) { const t = 1699990000 + i * 300; const p = 100 + Math.sin(i / 8); candles.push({ time: t, open: p, high: p + 0.4, low: p - 0.4, close: p + 0.1 }); }
        for (const side of ['SELL', 'BUY']) {
            const svg = buildGrabChartSvg({ candles, result: result(side), symbolName: 'Test', cfg, tp: targets(side, 101.1, cfg) });
            expect(svg).toContain('STOP-HUNT LINE');
            expect(svg).toContain('5 ENTRY');
            expect(svg.startsWith('<svg')).toBe(true);
        }
    });
});
