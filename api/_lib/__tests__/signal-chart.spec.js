/** @jest-environment node */
// Tests the chart picture for Telegram: the SVG contains every level, never breaks on missing
// parts, and (when the renderer package is installed) turns into a real PNG.
const { buildChartSvg, renderChartPng } = require('../signal-chart');

const TF = 900;
const START = Math.floor(Date.UTC(2026, 9, 14, 0, 0) / 1000);
function candles(n = 80) {
    const out = [];
    let p = 1.3235;
    for (let i = 0; i < n; i++) {
        const o = p;
        const c = o + (i % 7 < 4 ? 0.0002 : -0.00015);
        out.push({ time: START + i * TF, open: o, high: Math.max(o, c) + 0.0002, low: Math.min(o, c) - 0.0002, close: c });
        p = c;
    }
    return out;
}
const SIG = { side: 'SELL', entry: 1.32643, stopLoss: 1.3270923214285715, takeProfit: 1.32046, rr: 9.01, symbolName: 'GBP/USD', strategyName: 'Previous day <high> sweep', timeframe: TF };
const full = cs => ({
    range: { label: 'Previous day', high: 1.3262, low: 1.3205, startTime: cs[0].time, endTime: cs[40].time },
    sweep: { side: 'high', firstBreakTime: cs[57].time, confirmTime: cs[59].time, extreme: 1.3266, extremeTime: cs[58].time },
    bos: { side: 'SELL', level: 1.3258, swingTime: cs[50].time, bosTime: cs[62].time },
    fvg: { top: 1.3259, bottom: 1.3253, startTime: cs[60].time, endTime: cs[62].time },
    entryTime: cs[75].time,
});

describe('buildChartSvg', () => {
    test('contains the signal, all three levels, and the drawn setup parts', () => {
        const cs = candles();
        const svg = buildChartSvg({ candles: cs, analysis: full(cs), signal: SIG });
        expect(svg.startsWith('<svg')).toBe(true);
        for (const t of ['SELL', 'GBP/USD', '15m', '1.32643', '1.3270923', '1.32046', 'ENTRY', 'STOP LOSS', 'TAKE PROFIT', 'Sweep', 'BOS', 'FVG', 'Previous day high', 'Previous day low', '1 : 9.01']) {
            expect(svg).toContain(t);
        }
    });
    test('text from the data is escaped', () => {
        const cs = candles();
        const svg = buildChartSvg({ candles: cs, analysis: full(cs), signal: SIG });
        expect(svg).toContain('Previous day &lt;high&gt; sweep');
        expect(svg).not.toContain('<high>');
    });
    test('shows at most the last 70 candles', () => {
        const cs = candles(200);
        const svg = buildChartSvg({ candles: cs, analysis: {}, signal: SIG });
        expect((svg.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="#(26a69a|ef5350)"\/>/g) || []).length).toBe(70);
    });
    test('works with no range, sweep, BOS or FVG, and with few candles', () => {
        const cs = candles(5);
        expect(() => buildChartSvg({ candles: cs, analysis: {}, signal: SIG })).not.toThrow();
        expect(() => buildChartSvg({ candles: cs, analysis: null, signal: { ...SIG, side: 'BUY' } })).not.toThrow();
    });
    test('no NaN anywhere in the picture', () => {
        const cs = candles();
        expect(buildChartSvg({ candles: cs, analysis: full(cs), signal: SIG })).not.toMatch(/NaN|undefined|Infinity/);
    });
    test('times older than the first shown candle do not break it', () => {
        const cs = candles();
        const a = full(cs);
        a.range.startTime = cs[0].time - 99999;
        expect(buildChartSvg({ candles: cs, analysis: a, signal: SIG })).not.toMatch(/NaN/);
    });
    test('no candles -> a clear error', () => {
        expect(() => buildChartSvg({ candles: [], analysis: {}, signal: SIG })).toThrow(/No candles/);
    });
});

describe('renderChartPng', () => {
    test('returns a real PNG picture', () => {
        const cs = candles();
        const png = renderChartPng({ candles: cs, analysis: full(cs), signal: SIG });
        expect(Buffer.from(png).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(png.length).toBeGreaterThan(10000);
    });
});
