/** @jest-environment node */
// Tests the signal machine: login protection, closed markets, "only when a new candle closes",
// no duplicate signals, Telegram failures being retried, old setups being ignored, dry-run.
// Uses a real in-memory Postgres (PGlite) and fake Deriv / Telegram / strategy results.
const { PGlite } = require('@electric-sql/pglite');

jest.mock('../_lib/db', () => ({ getDb: () => global.__sql }));
jest.mock('../_lib/deriv', () => ({
    connect: jest.fn(),
    getActiveSymbols: jest.fn(),
    getCandles: jest.fn(),
}));
jest.mock('../_lib/telegram', () => ({ sendTelegram: jest.fn(), sendTelegramPhoto: jest.fn() }));
jest.mock('../_lib/signal-chart', () => ({ renderChartPng: jest.fn() }));
jest.mock('../_lib/engine', () => ({
    ...jest.requireActual('../_lib/engine'),
    analyse: jest.fn(),
}));

const deriv = require('../_lib/deriv');
const { sendTelegram, sendTelegramPhoto } = require('../_lib/telegram');
const chart = require('../_lib/signal-chart');
const engine = require('../_lib/engine');
const store = require('../_lib/signals-store');
const core = require('../_lib/signals-core');
const handler = require('../signal-watch');
const feed = require('../signals');
const admin = require('../signal-admin');

jest.setTimeout(60000);
let sharedDb;
function makeSql() {
    const db = sharedDb || (sharedDb = new PGlite());
    const sql = async (strings, ...vals) => {
        let q = '';
        strings.forEach((s, i) => { q += s; if (i < vals.length) q += `$${i + 1}`; });
        return (await db.query(q, vals.map(v => (v === undefined ? null : v)))).rows;
    };
    sql.db = db;
    return sql;
}

function call(h, { query = {}, headers = { authorization: 'Bearer s3cret' }, method = 'GET' } = {}) {
    return new Promise(resolve => {
        const res = {
            code: 200,
            setHeader() {},
            status(c) { this.code = c; return this; },
            json(b) { resolve({ status: this.code, body: b }); },
        };
        h({ method, query, headers }, res);
    });
}

const TF = 900;
const nowSec = () => Math.floor(Date.now() / 1000);
const lastClosedStart = () => Math.floor(nowSec() / TF) * TF - TF;
function candlesUpToNow() {
    const out = [];
    for (let t = lastClosedStart() - 30 * TF; t <= lastClosedStart() + TF; t += TF) out.push({ time: t, open: 1, high: 1.1, low: 0.9, close: 1 });
    return out; // last one is the still-forming candle
}
const readyAnalysis = (bosAgeCandles = 0, rr = 2.5) => ({
    state: 'ready',
    strategyName: 'Asian High/Low sweep',
    plan: { side: 'BUY', entry: 1.085, stopLoss: 1.08, takeProfit: 1.0975, rr },
    bos: { bosTime: lastClosedStart() - bosAgeCandles * TF },
});

const ENV = { ...process.env };
let client;
beforeEach(async () => {
    global.__sql = makeSql();
    await global.__sql.db.exec('DROP TABLE IF EXISTS signals, signal_watch_state, signal_watchlist');
    process.env = { ...ENV, SIGNALS_SECRET: 's3cret', WATCH_SYMBOLS: 'frxEURUSD', WATCH_STRATEGIES: '1', WATCH_TIMEFRAME: String(TF), TELEGRAM_GAP_MS: '0', WATCH_BATCH_GAP_MS: '0' };
    client = { close: jest.fn() };
    deriv.connect.mockReset().mockResolvedValue(client);
    deriv.getActiveSymbols.mockReset().mockResolvedValue([
        { underlying_symbol: 'frxEURUSD', underlying_symbol_name: 'EUR/USD', market: 'forex', exchange_is_open: 1, is_trading_suspended: 0 },
        { underlying_symbol: 'frxUSDJPY', underlying_symbol_name: 'USD/JPY', market: 'forex', exchange_is_open: 0, is_trading_suspended: 0 },
        { underlying_symbol: 'frxGBPUSD', underlying_symbol_name: 'GBP/USD', market: 'forex', exchange_is_open: 1, is_trading_suspended: 0 },
        { underlying_symbol: 'R_100', underlying_symbol_name: 'Volatility 100 Index', market: 'synthetic_index', exchange_is_open: 1, is_trading_suspended: 0 },
    ]);
    deriv.getCandles.mockReset().mockImplementation(async () => candlesUpToNow());
    sendTelegram.mockReset().mockResolvedValue({ messageId: 99 });
    sendTelegramPhoto.mockReset().mockResolvedValue({ messageId: 100 });
    // By default the picture cannot be drawn, so the older tests below keep checking the plain-text path.
    chart.renderChartPng.mockReset().mockImplementation(() => { throw new Error('no chart in this test'); });
    engine.analyse.mockReset().mockReturnValue(readyAnalysis());
});
afterEach(() => { process.env = ENV; });

describe('login protection', () => {
    test('no secret in the request -> 401', async () => {
        const r = await call(handler, { headers: {} });
        expect(r.status).toBe(401);
        expect(deriv.connect).not.toHaveBeenCalled();
    });
    test('wrong secret -> 401', async () => {
        const r = await call(handler, { headers: { authorization: 'Bearer nope' } });
        expect(r.status).toBe(401);
    });
    test('SIGNALS_SECRET not set on the server -> always 401', async () => {
        delete process.env.SIGNALS_SECRET;
        const r = await call(handler, { headers: { authorization: 'Bearer ' } });
        expect(r.status).toBe(401);
    });
    test('?key= works as well as the header', async () => {
        const r = await call(handler, { headers: {}, query: { key: 's3cret', dry: '1' } });
        expect(r.status).toBe(200);
    });
});

describe('sending signals', () => {
    test('a ready setup is saved once and sent to Telegram', async () => {
        const r = await call(handler);
        expect(r.status).toBe(200);
        expect(r.body.markets[0].results[0].telegram).toBe('sent');
        expect(sendTelegram).toHaveBeenCalledTimes(1);
        const text = sendTelegram.mock.calls[0][0];
        expect(text).toContain('BUY SIGNAL');
        expect(text).toContain('EUR/USD');
        expect(text).toContain('Signals only, not financial advice.');
        const rows = await global.__sql`SELECT * FROM signals`;
        expect(rows).toHaveLength(1);
        expect(rows[0].telegram_sent).toBe(true);
    });

    test('the same signal is never sent twice, even when forced to re-check', async () => {
        await call(handler);
        const again = await call(handler, { query: { force: '1' } });
        expect(again.body.markets[0].results[0].skipped).toMatch(/duplicate/i);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
        expect(await global.__sql`SELECT id FROM signals`).toHaveLength(1);
    });

    test('nothing is analysed again until a NEW candle has closed', async () => {
        await call(handler);
        engine.analyse.mockClear();
        deriv.getCandles.mockClear();
        const second = await call(handler);
        expect(second.body.markets[0].skipped).toMatch(/no new closed candle/i);
        expect(engine.analyse).not.toHaveBeenCalled();
        expect(deriv.getCandles).not.toHaveBeenCalled(); // not even downloaded
        expect(second.body.summary.noNewCandle).toBe(1);
    });

    test('a different entry price counts as a new signal', async () => {
        await call(handler);
        const a = readyAnalysis();
        a.plan.entry = 1.09;
        engine.analyse.mockReturnValue(a);
        await call(handler, { query: { force: '1' } });
        expect(sendTelegram).toHaveBeenCalledTimes(2);
    });

    test('RR below the minimum is not sent', async () => {
        process.env.MIN_RR = '3';
        const r = await call(handler);
        expect(r.body.markets[0].results[0].skipped).toMatch(/below minimum/i);
        expect(sendTelegram).not.toHaveBeenCalled();
    });

    test('an old setup (BOS many candles ago) is not sent', async () => {
        engine.analyse.mockReturnValue(readyAnalysis(10));
        const r = await call(handler);
        expect(r.body.markets[0].results[0].skipped).toMatch(/candles old/i);
        expect(sendTelegram).not.toHaveBeenCalled();
    });

    test('states that are not ready send nothing', async () => {
        engine.analyse.mockReturnValue({ state: 'waiting_bos', plan: null });
        await call(handler);
        expect(sendTelegram).not.toHaveBeenCalled();
    });
});

describe('chart picture', () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    beforeEach(() => { chart.renderChartPng.mockReset().mockReturnValue(PNG); });

    test('the signal is sent as a picture with the text as caption and a link to the Signals page', async () => {
        const r = await call(handler);
        expect(r.body.markets[0].results[0].telegram).toBe('sent');
        expect(r.body.markets[0].results[0].picture).toBe(true);
        expect(sendTelegramPhoto).toHaveBeenCalledTimes(1);
        expect(sendTelegram).not.toHaveBeenCalled();
        const [png, caption] = sendTelegramPhoto.mock.calls[0];
        expect(png).toBe(PNG);
        expect(caption).toContain('BUY SIGNAL');
        expect(caption).toContain('https://www.executiveprimemarkets.site/signals.html');
        expect(caption.length).toBeLessThan(1024);
        const rows = await global.__sql`SELECT telegram_sent, telegram_message_id FROM signals`;
        expect(rows[0].telegram_sent).toBe(true);
        expect(Number(rows[0].telegram_message_id)).toBe(100);
    });

    test('the picture is drawn from the closed candles and the analysis of this signal', async () => {
        await call(handler);
        const input = chart.renderChartPng.mock.calls[0][0];
        expect(input.signal.side).toBe('BUY');
        expect(input.analysis.state).toBe('ready');
        const now = nowSec();
        expect(input.candles.length).toBeGreaterThan(10);
        expect(input.candles.every(c => c.time + TF <= now)).toBe(true);
    });

    test('SITE_URL changes the link', async () => {
        process.env.SITE_URL = 'https://example.org/';
        await call(handler);
        expect(sendTelegramPhoto.mock.calls[0][1]).toContain('https://example.org/signals.html');
    });

    test('if Telegram refuses the picture, the text message is sent instead', async () => {
        sendTelegramPhoto.mockRejectedValueOnce(new Error('Telegram refused the picture (400): bad'));
        const r = await call(handler);
        expect(r.body.markets[0].results[0].telegram).toBe('sent');
        expect(r.body.markets[0].results[0].picture).toMatch(/failed/);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
        expect(sendTelegram.mock.calls[0][0]).toContain('BUY SIGNAL');
        expect(sendTelegram.mock.calls[0][0]).toContain('signals.html');
    });

    test('if the picture cannot be drawn, the text message is sent instead', async () => {
        chart.renderChartPng.mockImplementation(() => { throw new Error('renderer missing'); });
        const r = await call(handler);
        expect(r.body.markets[0].results[0].picture).toMatch(/renderer missing/);
        expect(sendTelegramPhoto).not.toHaveBeenCalled();
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });

    test('if both fail, the signal stays on the website and is retried as text next run', async () => {
        sendTelegramPhoto.mockRejectedValueOnce(new Error('down'));
        sendTelegram.mockRejectedValueOnce(new Error('down'));
        const first = await call(handler);
        expect(first.body.markets[0].results[0].telegram).toMatch(/failed/);
        await call(handler, { query: { force: '1' } });
        const rows = await global.__sql`SELECT telegram_sent FROM signals`;
        expect(rows[0].telegram_sent).toBe(true);
        expect(sendTelegram).toHaveBeenCalledTimes(2);
    });

    test('?dry=1 reports whether the picture could be drawn, and sends nothing', async () => {
        const r = await call(handler, { query: { dry: '1' } });
        expect(r.body.markets[0].results[0].picture).toMatch(/^ok/);
        expect(sendTelegramPhoto).not.toHaveBeenCalled();
        expect(sendTelegram).not.toHaveBeenCalled();
    });
});

describe('markets', () => {
    test('a closed market is skipped without downloading candles', async () => {
        process.env.WATCH_SYMBOLS = 'frxUSDJPY';
        const r = await call(handler);
        expect(r.body.markets[0].skipped).toMatch(/closed or suspended/i);
        expect(deriv.getCandles).not.toHaveBeenCalled();
    });
    test('an unknown symbol is reported, not crashed on', async () => {
        process.env.WATCH_SYMBOLS = 'frxNOPE';
        const r = await call(handler);
        expect(r.status).toBe(200);
        expect(r.body.markets[0].skipped).toMatch(/not in the deriv/i);
    });
    test('one market failing does not stop the others', async () => {
        process.env.WATCH_SYMBOLS = 'frxEURUSD,frxGBPUSD';
        deriv.getCandles.mockRejectedValueOnce(new Error('boom'));
        const r = await call(handler);
        expect(r.status).toBe(500);
        expect(r.body.markets[0].error).toBe('boom');
        expect(r.body.markets[1].results[0].telegram).toBe('sent');
    });
    test('Deriv unreachable -> 502 and a clear message', async () => {
        deriv.connect.mockRejectedValue(new Error('Could not connect to Deriv'));
        const r = await call(handler);
        expect(r.status).toBe(502);
    });
    test('the Deriv connection is always closed', async () => {
        await call(handler);
        expect(client.close).toHaveBeenCalled();
    });
});

describe('Telegram problems', () => {
    test('a Telegram failure keeps the signal on the website and retries on the next run', async () => {
        sendTelegram.mockRejectedValueOnce(new Error('Telegram refused the message (400): chat not found'));
        const first = await call(handler);
        expect(first.body.markets[0].results[0].telegram).toMatch(/failed/);
        let rows = await global.__sql`SELECT telegram_sent FROM signals`;
        expect(rows[0].telegram_sent).toBe(false);

        await call(handler, { query: { force: '1' } });
        rows = await global.__sql`SELECT telegram_sent FROM signals`;
        expect(rows[0].telegram_sent).toBe(true);
        expect(sendTelegram).toHaveBeenCalledTimes(2); // 1 failed + 1 retry; the duplicate is not sent again
    });
    test('?test=1 sends only the test message', async () => {
        const r = await call(handler, { query: { test: '1' } });
        expect(r.body.telegram).toBe('sent');
        expect(deriv.connect).not.toHaveBeenCalled();
    });
    test('?test=1 reports a Telegram error clearly', async () => {
        sendTelegram.mockRejectedValueOnce(new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set'));
        const r = await call(handler, { query: { test: '1' } });
        expect(r.status).toBe(502);
        expect(r.body.telegram).toMatch(/not set/);
    });
});

describe('dry run and feed', () => {
    test('?dry=1 shows the message but sends and saves nothing', async () => {
        const r = await call(handler, { query: { dry: '1' } });
        expect(r.body.markets[0].results[0].wouldSend).toContain('BUY SIGNAL');
        expect(sendTelegram).not.toHaveBeenCalled();
    });
    test('the public feed lists saved signals, newest first', async () => {
        await call(handler);
        const a = readyAnalysis();
        a.plan.entry = 1.09;
        engine.analyse.mockReturnValue(a);
        await call(handler, { query: { force: '1' } });
        const r = await call(feed, { headers: {} });
        expect(r.status).toBe(200);
        expect(r.body.signals).toHaveLength(2);
        expect(r.body.signals[0].entry).toBe(1.09);
        expect(r.body.signals[0].status).toBe('active');
        expect(Object.keys(r.body.signals[0])).not.toContain('dedupe_key');
    });
    test('the feed refuses anything but GET', async () => {
        const r = await call(feed, { method: 'POST', headers: {} });
        expect(r.status).toBe(405);
    });
});

describe('helpers', () => {
    test('message format', () => {
        const t = core.formatTelegram({ side: 'SELL', symbol: 'frxEURUSD', symbolName: 'EUR/USD', strategyName: 'Prev Day <x>', timeframe: 900, entry: 1.0851, stopLoss: 1.09, takeProfit: 1.07, rr: 2.123, time: 1760432400 });
        expect(t).toContain('🔴 <b>SELL SIGNAL</b>: EUR/USD');
        expect(t).toContain('Prev Day &lt;x&gt;');
        expect(t).toContain('⏱ Timeframe: 15m');
        expect(t).toContain('1 : 2.12');
        expect(t).toContain('2025-10-14 09:15 GMT');
    });
    test('config defaults and clean-up', () => {
        expect(core.readConfig({})).toEqual({
            symbols: ['frxEURUSD'], timeframe: 900, strategies: [1, 2, 3, 4, 5], minRr: 2, maxAgeCandles: 3,
            concurrency: 3, batchGapMs: 1000, budgetMs: 45000, telegramGapMs: 1100,
        });
        expect(core.readConfig({ WATCH_SYMBOLS: ' a , b ', WATCH_TIMEFRAME: 'x', WATCH_STRATEGIES: '1,9,3', SIGNAL_MAX_AGE_CANDLES: '0' }))
            .toMatchObject({ symbols: ['a', 'b'], timeframe: 900, strategies: [1, 3], maxAgeCandles: 0 });
    });
});

describe('watchlist (Phase 2)', () => {
    const saveList = async obj => {
        const r = await call(admin, { method: 'POST', headers: { 'x-signals-key': 's3cret' }, body: { symbols: obj } });
        expect(r.status).toBe(200);
        return r;
    };
    const call2 = (h, opts) => new Promise(resolve => {
        const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
        h({ method: 'GET', query: {}, headers: { authorization: 'Bearer s3cret' }, ...opts }, res);
    });
    // `call` ignores a body, so admin POSTs use call2
    const post = body => call2(admin, { method: 'POST', body });

    test('with nothing saved, the environment list is used', async () => {
        const r = await call(handler, { query: { dry: '1' } });
        expect(r.body.watchlistSource).toMatch(/environment/);
        expect(r.body.markets.map(m => m.symbol)).toEqual(['frxEURUSD']);
    });

    test('a saved watchlist replaces the environment list, and only ticked markets are watched', async () => {
        const saved = await post({ symbols: { frxGBPUSD: true, R_100: true, frxEURUSD: false } });
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({ ok: true, saved: 3, enabled: 2 });
        const r = await call(handler, { query: { dry: '1' } });
        expect(r.body.watchlistSource).toBe('database');
        expect(r.body.markets.map(m => m.symbol).sort()).toEqual(['R_100', 'frxGBPUSD']);
        expect(r.body.summary.watching).toBe(2);
    });

    test('everything switched off means nothing is watched (not a fallback to the environment)', async () => {
        await post({ symbols: { frxEURUSD: false } });
        const r = await call(handler);
        expect(r.body.markets).toEqual([]);
        expect(deriv.getCandles).not.toHaveBeenCalled();
    });

    test('synthetic markets are analysed as synthetic', async () => {
        await post({ symbols: { R_100: true } });
        await call(handler);
        expect(engine.analyse.mock.calls[0][2]).toBe('synthetic');
    });

    test('the run summary counts what happened', async () => {
        await post({ symbols: { frxEURUSD: true, frxUSDJPY: true, frxGBPUSD: true } });
        const r = await call(handler);
        expect(r.body.summary).toMatchObject({ watching: 3, analysed: 2, closedOrSuspended: 1, signalsSaved: 2, telegramSent: 2, errors: 0, deferred: 0 });
    });

    test('markets checked longest ago go first, and a run that runs out of time defers the rest', async () => {
        await post({ symbols: { frxEURUSD: true, frxGBPUSD: true, R_100: true } });
        // checked 2 days ago, 1 hour ago, and just now
        await global.__sql`INSERT INTO signal_watch_state (symbol, timeframe, last_candle, updated_at) VALUES ('frxGBPUSD', ${TF}, 1, now() - interval '2 days')`;
        await global.__sql`INSERT INTO signal_watch_state (symbol, timeframe, last_candle, updated_at) VALUES ('frxEURUSD', ${TF}, 1, now() - interval '1 hour')`;
        await global.__sql`INSERT INTO signal_watch_state (symbol, timeframe, last_candle, updated_at) VALUES ('R_100', ${TF}, 1, now())`;
        process.env.WATCH_CONCURRENCY = '1';
        let fake = Date.now();
        const spy = jest.spyOn(Date, 'now').mockImplementation(() => fake);
        deriv.getCandles.mockImplementation(async () => { const c = candlesUpToNow(); fake += 30000; return c; });
        const r = await call(handler, { query: { dry: '1' } });
        spy.mockRestore();
        // 30 s per market, 45 s budget: the two least recently checked are done, the most recent waits
        expect(r.body.markets.map(m => m.symbol)).toEqual(['frxGBPUSD', 'frxEURUSD']);
        expect(r.body.summary.deferred).toBe(1);
        expect(r.body.deferredFirst).toEqual(['R_100']);
    });

    test('markets are fetched in small batches, not all at once', async () => {
        await post({ symbols: { frxEURUSD: true, frxGBPUSD: true, R_100: true, frxAUDUSD: true } });
        let running = 0; let peak = 0;
        deriv.getCandles.mockImplementation(async () => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 15)); running--; return candlesUpToNow(); });
        process.env.WATCH_CONCURRENCY = '2';
        await call(handler, { query: { dry: '1' } });
        expect(peak).toBe(2);
    });
});

describe('admin API', () => {
    const run = (method, { headers = { 'x-signals-key': 's3cret' }, body, query = {} } = {}) => new Promise(resolve => {
        const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
        admin({ method, headers, body, query }, res);
    });

    test('needs the secret', async () => {
        expect((await run('GET', { headers: {} })).status).toBe(401);
        expect((await run('POST', { headers: { 'x-signals-key': 'nope' }, body: { symbols: { a: true } } })).status).toBe(401);
    });

    test('GET lists every Deriv market with open/closed and which are ticked', async () => {
        const r = await run('GET');
        expect(r.status).toBe(200);
        expect(r.body.source).toBe('environment');
        const eur = r.body.markets.find(m => m.symbol === 'frxEURUSD');
        const jpy = r.body.markets.find(m => m.symbol === 'frxUSDJPY');
        expect(eur).toMatchObject({ name: 'EUR/USD', open: true, enabled: true });
        expect(jpy).toMatchObject({ open: false, enabled: false });
    });

    test('POST saves, GET shows it, and a later POST changes only what it sends', async () => {
        await run('POST', { body: { symbols: { frxGBPUSD: true, frxEURUSD: false } } });
        let r = await run('GET');
        expect(r.body.source).toBe('database');
        expect(r.body.markets.find(m => m.symbol === 'frxGBPUSD').enabled).toBe(true);
        expect(r.body.markets.find(m => m.symbol === 'frxEURUSD').enabled).toBe(false);
        await run('POST', { body: { symbols: { frxEURUSD: true } } });
        r = await run('GET');
        expect(r.body.markets.find(m => m.symbol === 'frxEURUSD').enabled).toBe(true);
        expect(r.body.markets.find(m => m.symbol === 'frxGBPUSD').enabled).toBe(true);
    });

    test('rejects bad input', async () => {
        for (const body of [undefined, {}, { symbols: [] }, { symbols: {} }, { symbols: { 'bad symbol!': true } }, { symbols: { frxEURUSD: 'yes' } }]) {
            expect((await run('POST', { body })).status).toBe(400);
        }
        const tooMany = {}; for (let i = 0; i < 501; i++) tooMany['S' + i] = true;
        expect((await run('POST', { body: { symbols: tooMany } })).status).toBe(400);
    });

    test('if Deriv is unreachable the page still gets an answer with the reason', async () => {
        deriv.connect.mockRejectedValue(new Error('Could not connect to Deriv'));
        const r = await run('GET');
        expect(r.status).toBe(200);
        expect(r.body.derivError).toMatch(/connect/);
        expect(r.body.markets).toEqual([]);
    });

    test('only GET and POST', async () => {
        expect((await run('DELETE')).status).toBe(405);
    });
});
