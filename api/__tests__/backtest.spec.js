/** @jest-environment node */
// Tests the backtest: that it scores trades exactly like the live results, applies the same setup
// checks as the live watcher, never double counts a setup, and that the endpoint behaves.
const { PGlite } = require('@electric-sql/pglite');

jest.mock('../_lib/db', () => ({ getDb: () => global.__sql }));
jest.mock('../_lib/deriv', () => ({ connect: jest.fn(), getActiveSymbols: jest.fn(), getCandlesBack: jest.fn() }));
jest.mock('../_lib/engine', () => ({ ...jest.requireActual('../_lib/engine'), analyse: jest.fn() }));

const deriv = require('../_lib/deriv');
const engine = require('../_lib/engine');
const bt = require('../_lib/backtest');
const handler = require('../signal-backtest');

const TF = 3600;
const BASE = Date.UTC(2026, 9, 13, 0, 0) / 1000;
const flat = i => ({ time: BASE + i * TF, open: 101, high: 101.5, low: 100.5, close: 101 });
const series = (n, overrides = {}) => Array.from({ length: n }, (_, i) => ({ ...flat(i), ...(overrides[i] || {}) }));
const CFG = { timeframe: TF, maxAgeCandles: 3, minRr: 2 };
const plan = (over = {}) => ({ side: 'BUY', entry: 100, stopLoss: 99, takeProfit: 103, rr: 3, ...over });

/** analyse() says "ready" only when the newest closed candle is one of `readyAt` (candle indexes). */
function readyAt(indexes, planOver, bosAgeCandles = 0) {
    const times = new Set(indexes.map(i => BASE + i * TF));
    engine.analyse.mockImplementation((id, closed) => {
        const last = closed[closed.length - 1].time;
        if (id === 1 && times.has(last)) return { state: 'ready', strategyName: 'Test strategy', plan: plan(planOver), bos: { bosTime: last - bosAgeCandles * TF } };
        return { state: 'waiting_for_sweep', plan: null };
    });
}
const run = (candles, extra = {}) => bt.runBacktest({ symbol: 'frxEURUSD', symbolName: 'EUR/USD', market: 'forex', candles, timeframe: TF, strategies: [1], cfg: CFG, window: 5, ...extra });

beforeEach(() => engine.analyse.mockReset());

describe('scoring trades like the live results', () => {
    test('entered then target reached = hit_tp', () => {
        readyAt([8]);
        const t = run(series(20, { 9: { low: 99.8, high: 101 }, 10: { high: 103.5 } }));
        expect(t).toHaveLength(1);
        expect(t[0]).toMatchObject({ status: 'hit_tp', side: 'BUY', rr: 3, strategyId: 1, symbol: 'frxEURUSD' });
    });
    test('entered then stop reached = hit_sl', () => {
        readyAt([8]);
        const t = run(series(20, { 9: { low: 99.8, high: 101 }, 10: { low: 98.5 } }));
        expect(t[0].status).toBe('hit_sl');
    });
    test('a candle that touches the stop and the target together is a LOSS', () => {
        readyAt([8]);
        const t = run(series(20, { 9: { low: 99.8, high: 101 }, 10: { low: 98.5, high: 103.5 } }));
        expect(t[0].status).toBe('hit_sl');
    });
    test('in the entry candle the target does not count (only from the next candle)', () => {
        readyAt([8]);
        const t = run(series(20, { 9: { low: 99.8, high: 103.5 }, 10: { high: 101 } }));
        expect(t[0].status).not.toBe('hit_tp');
    });
    test('target reached without ever touching the entry = not_triggered', () => {
        readyAt([8]);
        const t = run(series(20, { 9: { low: 100.6, high: 103.5 } }));
        expect(t[0].status).toBe('not_triggered');
    });
    test('a very recent signal with no result yet is open', () => {
        readyAt([18]);
        const t = run(series(20));
        expect(t[0].status).toBe('open');
    });
    test('entered but nothing happened before the time limit = expired', () => {
        readyAt([8]);
        const t = run(series(20, { 9: { low: 99.8, high: 101 } }), { expirySeconds: 2 * TF });
        expect(t[0].status).toBe('expired');
    });
    test('SELL trades work the same way, upside down', () => {
        readyAt([8], { side: 'SELL', entry: 102, stopLoss: 103, takeProfit: 99, rr: 3 });
        const t = run(series(20, { 9: { high: 102.2, low: 100.5 }, 10: { low: 98.5 } }));
        expect(t[0]).toMatchObject({ side: 'SELL', status: 'hit_tp' });
    });
});

describe('same rules as the live watcher', () => {
    test('the same setup staying ready on later candles is ONE trade', () => {
        readyAt([8, 9, 10]);
        expect(run(series(20))).toHaveLength(1);
    });
    test('a different entry price is a different trade', () => {
        let n = 0;
        engine.analyse.mockImplementation((id, closed) => {
            const i = (closed[closed.length - 1].time - BASE) / TF;
            if (id === 1 && (i === 8 || i === 10)) return { state: 'ready', strategyName: 'T', plan: plan({ entry: 100 + (n++) * 0.1 }), bos: { bosTime: closed[closed.length - 1].time } };
            return { state: 'x', plan: null };
        });
        expect(run(series(20))).toHaveLength(2);
    });
    test('reward below the minimum, impossible levels and stale setups are all skipped', () => {
        readyAt([8], { rr: 1.5 });
        expect(run(series(20))).toHaveLength(0);
        readyAt([8], { stopLoss: 101, rr: 3 }); // stop above a BUY entry
        expect(run(series(20))).toHaveLength(0);
        readyAt([8], {}, 5); // break of structure 5 candles ago, limit is 3
        expect(run(series(20))).toHaveLength(0);
    });
    test('what-if filters: too-tight stops and too-good-to-be-true rewards can be excluded', () => {
        readyAt([25]); // needs 15+ candles of history for the ATR, so a longer window than the other tests
        const go = filters => run(series(40), { window: 20, filters });
        expect(go({ minStopAtr: 5 })).toHaveLength(0); // the stop is about 1 ATR
        expect(go({ maxRr: 2.5 })).toHaveLength(0);
        expect(go({ minStopAtr: 0.5, maxRr: 5 })).toHaveLength(1);
        expect(go({})[0].stopAtr).toBeGreaterThan(0.5);
    });
    test('not enough history means no trades, not a crash', () => {
        readyAt([1]);
        expect(run(series(4))).toEqual([]);
    });
    test('hour of day is taken from the moment the signal candle closed', () => {
        readyAt([8]);
        expect(run(series(20))[0].hourUtc).toBe(9);
    });
});

describe('the numbers', () => {
    const T = (status, rr = 2, over = {}) => ({ status, rr, strategyId: 1, strategyName: 'S', side: 'BUY', kind: 'forex', symbol: 'A', symbolName: 'A', hourUtc: 9, age: 0, stopAtr: 1, ...over });
    test('win rate, expectancy and profit factor', () => {
        const s = bt.summarise([T('hit_tp'), T('hit_tp'), T('hit_tp'), T('hit_sl'), T('not_triggered'), T('expired'), T('open')]);
        expect(s).toMatchObject({ signals: 7, decided: 4, wins: 3, losses: 1, notTriggered: 1, expired: 1, open: 1, winRate: 75, avgWinRR: 2, expectancyR: 1.25, profitFactor: 6 });
    });
    test('a strategy that wins 1 in 3 at 1:2 breaks even (0R)', () => {
        expect(bt.summarise([T('hit_tp', 2), T('hit_sl'), T('hit_sl')]).expectancyR).toBe(0);
    });
    test('all losses: negative expectancy, win rate 0', () => {
        expect(bt.summarise([T('hit_sl'), T('hit_sl')])).toMatchObject({ winRate: 0, expectancyR: -1, profitFactor: 0 });
    });
    test('no decided trades gives nulls, never NaN', () => {
        expect(bt.summarise([])).toMatchObject({ signals: 0, decided: 0, winRate: null, expectancyR: null, profitFactor: null });
        expect(bt.summarise([T('open')]).winRate).toBeNull();
    });
    test('report groups by strategy, session, reward and stop size in a sensible order', () => {
        const r = bt.buildReport([
            T('hit_tp', 2.5, { hourUtc: 3, stopAtr: 0.3 }), T('hit_sl', 3.5, { hourUtc: 9, stopAtr: 0.7, strategyId: 2, strategyName: 'Two' }),
            T('hit_sl', 5, { hourUtc: 14, stopAtr: 1.2 }), T('hit_sl', 8, { hourUtc: 20, stopAtr: 3 }),
        ]);
        expect(r.bySession.map(x => x.name)).toEqual(['Asia 00-07 GMT', 'London 07-12 GMT', 'New York 12-17 GMT', 'Late 17-24 GMT']);
        expect(r.byReward.map(x => x.name)).toEqual(['RR 2-3', 'RR 3-4', 'RR 4-6', 'RR 6+']);
        expect(r.byStopSize.map(x => x.name)).toEqual(['stop < 0.5 ATR', 'stop 0.5-1 ATR', 'stop 1-1.5 ATR', 'stop > 2.5 ATR']);
        expect(r.byStrategy.map(x => x.name)).toEqual(['1. S', '2. Two']);
        expect(r.notes[0]).toMatch(/too few/i);
    });
    test('results are also split by calendar quarter, oldest first', () => {
        expect(bt.quarterOf(Date.UTC(2026, 9, 15) / 1000)).toBe('2026 Q4');
        expect(bt.quarterOf(Date.UTC(2026, 0, 1) / 1000)).toBe('2026 Q1');
        const r = bt.buildReport([T('hit_tp', 2, { time: Date.UTC(2026, 9, 1) / 1000 }), T('hit_sl', 2, { time: Date.UTC(2026, 0, 5) / 1000 }), T('hit_sl', 2, { time: Date.UTC(2025, 10, 5) / 1000 })]);
        expect(r.byPeriod.map(x => x.name)).toEqual(['2025 Q4', '2026 Q1', '2026 Q4']);
    });
    test('the real engine replays months of data without errors', () => {
        engine.analyse.mockImplementation(jest.requireActual('../_lib/engine').analyse);
        let p = 1.1; const cs = [];
        for (let i = 0; i < 1200; i++) { const o = p; p = o + (Math.sin(i / 9) + Math.random() - 0.5) * 0.0035; cs.push({ time: BASE + i * TF, open: o, high: Math.max(o, p) + 0.001 * Math.random(), low: Math.min(o, p) - 0.001 * Math.random(), close: p }); }
        const t = bt.runBacktest({ symbol: 'x', market: 'forex', candles: cs, timeframe: TF, strategies: [1, 2, 3, 4, 5], cfg: CFG });
        expect(Array.isArray(t)).toBe(true);
        for (const x of t) { expect(['hit_tp', 'hit_sl', 'not_triggered', 'expired', 'open']).toContain(x.status); expect(Number.isFinite(x.rr)).toBe(true); }
    });
});

describe('the endpoint', () => {
    let sharedDb;
    const makeSql = () => {
        const db = sharedDb || (sharedDb = new PGlite());
        const sql = async (strings, ...vals) => { let q = ''; strings.forEach((s, i) => { q += s; if (i < vals.length) q += `$${i + 1}`; }); return (await db.query(q, vals.map(v => (v === undefined ? null : v)))).rows; };
        sql.db = db;
        return sql;
    };
    const call = (query = {}, { headers = { authorization: 'Bearer s3cret' }, method = 'GET' } = {}) => new Promise(resolve => {
        const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
        handler({ method, query, headers }, res);
    });
    // 700 hourly candles ending a few hours ago; a BUY setup at candle 400 that reaches its target
    const recent = () => {
        const end = Math.floor(Date.now() / 1000 / TF) * TF - 2 * TF;
        return Array.from({ length: 700 }, (_, i) => ({ time: end - (699 - i) * TF, open: 101, high: 101.5, low: 100.5, close: 101 })).map((c, i) => (i === 401 ? { ...c, low: 99.8, high: 101 } : i === 402 ? { ...c, high: 103.5 } : c));
    };
    const signalAt400 = () => engine.analyse.mockImplementation((id, closed, kind, f, now) => {
        const idx = closed.length === 360 ? 0 : -1;
        const last = closed[closed.length - 1];
        return id === 1 && last.time === recentCandles[400].time ? { state: 'ready', strategyName: 'Test', plan: plan(), bos: { bosTime: last.time } } : { state: 'waiting_bos', plan: null };
    });
    let recentCandles;
    const ENV = { ...process.env };
    beforeEach(async () => {
        global.__sql = makeSql();
        await global.__sql.db.exec('DROP TABLE IF EXISTS signals, signal_watch_state, signal_watchlist, signal_news_cache');
        process.env = { ...ENV, SIGNALS_SECRET: 's3cret', WATCH_TIMEFRAME: String(TF), WATCH_BATCH_GAP_MS: '0', WATCH_STRATEGIES: '1' };
        deriv.connect.mockReset().mockResolvedValue({ close: jest.fn() });
        deriv.getActiveSymbols.mockReset().mockResolvedValue([
            { underlying_symbol: 'frxEURUSD', underlying_symbol_name: 'EUR/USD', market: 'forex' },
            { underlying_symbol: 'frxGBPUSD', underlying_symbol_name: 'GBP/USD', market: 'forex' },
            { underlying_symbol: 'cryBTCUSD', underlying_symbol_name: 'Bitcoin', market: 'cryptocurrency' },
        ]);
        recentCandles = recent();
        deriv.getCandlesBack.mockReset().mockImplementation(async () => recentCandles);
        signalAt400();
    });
    afterEach(() => { process.env = ENV; });
    jest.setTimeout(60000);

    test('needs the secret and only allows GET', async () => {
        expect((await call({}, { headers: {} })).status).toBe(401);
        expect((await call({}, { method: 'POST' })).status).toBe(405);
        expect(deriv.connect).not.toHaveBeenCalled();
    });
    test('replays the given markets and reports the results', async () => {
        const r = await call({ symbols: 'frxEURUSD,frxGBPUSD' });
        expect(r.status).toBe(200);
        expect(r.body.symbolsTested).toBe(2);
        expect(r.body.overall).toMatchObject({ signals: 2, wins: 2, winRate: 100, expectancyR: 3 });
        expect(r.body.byStrategy[0].name).toBe('1. Test');
        expect(r.body.bySymbol).toHaveLength(2);
        expect(r.body.latestTrades).toBeUndefined();
    });
    test('trades=1 also lists the latest trades', async () => {
        const r = await call({ symbols: 'frxEURUSD', trades: '1' });
        expect(r.body.latestTrades).toHaveLength(1);
        expect(r.body.latestTrades[0]).toMatchObject({ symbol: 'frxEURUSD', status: 'hit_tp', side: 'BUY' });
    });
    test('with no symbols given it uses your saved watchlist', async () => {
        const store = require('../_lib/signals-store');
        await store.ensureTables(global.__sql);
        await store.setWatchlist(global.__sql, [['frxGBPUSD', true], ['frxEURUSD', false]]);
        const r = await call({});
        expect(r.body.symbolsTested).toBe(1);
        expect(r.body.bySymbol[0].name).toMatch(/GBP/);
    });
    test('markets= limits the test to some market groups', async () => {
        const r = await call({ symbols: 'frxEURUSD,cryBTCUSD', markets: 'cryptocurrency' });
        expect(r.body.symbolsTested).toBe(1);
        expect(r.body.bySymbol[0].name).toMatch(/Bitcoin/);
    });
    test('unknown markets and short histories are reported, not fatal', async () => {
        deriv.getCandlesBack.mockImplementation(async (c, symbol) => (symbol === 'frxGBPUSD' ? recentCandles.slice(-50) : recentCandles));
        const r = await call({ symbols: 'frxEURUSD,frxGBPUSD,frxNOPE' });
        expect(r.status).toBe(200);
        expect(r.body.symbolsTested).toBe(1);
        expect(r.body.skipped.map(s => s.symbol).sort()).toEqual(['frxGBPUSD', 'frxNOPE']);
    });
    test('a market whose download fails is skipped and the others still run', async () => {
        deriv.getCandlesBack.mockImplementationOnce(async () => { throw new Error('rate limited'); });
        const r = await call({ symbols: 'frxEURUSD,frxGBPUSD' });
        expect(r.body.symbolsTested).toBe(1);
        expect(r.body.skipped[0].reason).toMatch(/rate limited/);
    });
    test('what-if settings change the result', async () => {
        expect((await call({ symbols: 'frxEURUSD', minRr: '4' })).body.overall.signals).toBe(0);
        expect((await call({ symbols: 'frxEURUSD', maxRr: '2' })).body.overall.signals).toBe(0);
        expect((await call({ symbols: 'frxEURUSD', strategies: '2' })).body.overall.signals).toBe(0);
    });
    test('more than 60 markets are cut with a clear message', async () => {
        const many = Array.from({ length: 70 }, (_, i) => `frxA${i}`).join(',');
        const r = await call({ symbols: many });
        expect(r.body.skipped.some(s => /Only 60 markets/.test(s.reason))).toBe(true);
    });
    test('when time runs out, the untested markets are listed so you can run them next', async () => {
        process.env.WATCH_CONCURRENCY = '1';
        let fake = Date.now();
        const spy = jest.spyOn(Date, 'now').mockImplementation(() => fake);
        deriv.getCandlesBack.mockImplementation(async () => { fake += 30000; return recentCandles; });
        const r = await call({ symbols: 'frxEURUSD,frxGBPUSD,cryBTCUSD' });
        spy.mockRestore();
        expect(r.body.symbolsTested).toBe(2);
        expect(r.body.unfinished).toEqual(['cryBTCUSD']);
        expect(r.body.notes.join(' ')).toMatch(/Time ran out.*cryBTCUSD/);
    });
    test('Deriv unreachable gives a clear 502', async () => {
        deriv.connect.mockRejectedValue(new Error('Could not connect to Deriv'));
        expect((await call({ symbols: 'frxEURUSD' })).status).toBe(502);
    });
});
