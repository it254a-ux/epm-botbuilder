/** @jest-environment node */
// Tests the M15 direction + M5 entry watcher: it sends a CONFIRMED signal only, never WAIT, never twice,
// never on bad data, and it leaves the H1 watcher alone. The analysis itself is tested in mtf.spec.js.
const { PGlite } = require('@electric-sql/pglite');

jest.mock('../_lib/db', () => ({ getDb: () => global.__sql }));
jest.mock('../_lib/deriv', () => ({ connect: jest.fn(), getActiveSymbols: jest.fn(), getCandles: jest.fn() }));
jest.mock('../_lib/telegram', () => ({ sendTelegram: jest.fn(), sendTelegramPhoto: jest.fn() }));
jest.mock('../_lib/mtf', () => ({ analyseMtf: jest.fn() }));
jest.mock('../_lib/ict', () => ({ analyseIct: jest.fn() }));
jest.mock('../_lib/signal-chart', () => ({ renderChartPng: jest.fn() }));

const deriv = require('../_lib/deriv');
const { sendTelegram, sendTelegramPhoto } = require('../_lib/telegram');
const chart = require('../_lib/signal-chart');
const mtf = require('../_lib/mtf');
const ict = require('../_lib/ict');
const store = require('../_lib/signals-store');
const core = require('../_lib/signals-core');
const handler = require('../signal-watch-mtf');

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
jest.setTimeout(60000);

const call = (query = {}, { headers = { authorization: 'Bearer s3cret' }, method = 'GET' } = {}) => new Promise(resolve => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    handler({ method, query, headers }, res);
});

const nowSec = () => Math.floor(Date.now() / 1000);
const closeOfLast = () => Math.floor(nowSec() / 300) * 300; // the close time of the newest closed M5 candle
const BUY = (over = {}) => ({
    signal: 'BUY', bias: 'bullish', m15Text: 'M15 is bullish: higher highs and higher lows.', m5Status: 'confirmed',
    m5Text: 'M5 pulled back, then a candle closed above 2345.10.', levels: {},
    plan: { side: 'BUY', entry: 2350.5, stopLoss: 2345, takeProfit: 2365, rr: 2.64, risk: 5.5 },
    reasons: ['M15 bullish', 'M5 confirmed'], signalTime: closeOfLast(), lastPrice: 2350.5, key: 'k', ...over,
});
const SELL = () => BUY({ signal: 'SELL', bias: 'bearish', m15Text: 'M15 is bearish: lower highs and lower lows.', plan: { side: 'SELL', entry: 1.1, stopLoss: 1.1055, takeProfit: 1.0865, rr: 2.45, risk: 0.0055 } });
const WAIT = (over = {}) => ({
    signal: 'WAIT', bias: 'unclear', m15Text: 'M15 direction is unclear.', m5Status: 'waiting', m5Text: 'Not checked.',
    plan: null, reasons: ['WAIT / NO SIGNAL: M15 direction is unclear.'], signalTime: closeOfLast(), lastPrice: 1, key: 'w', ...over,
});

const ENV = { ...process.env };
beforeEach(async () => {
    global.__sql = makeSql();
    await global.__sql.db.exec('DROP TABLE IF EXISTS signals, signal_watch_state, signal_watchlist, signal_news_cache');
    process.env = { ...ENV, SIGNALS_SECRET: 's3cret', WATCH_SYMBOLS: 'frxEURUSD', TELEGRAM_GAP_MS: '0', WATCH_BATCH_GAP_MS: '0', NEWS_FILTER: 'off', MTF_COOLDOWN_MIN: '30' };
    deriv.connect.mockReset().mockResolvedValue({ close: jest.fn() });
    deriv.getActiveSymbols.mockReset().mockResolvedValue([
        { underlying_symbol: 'frxEURUSD', underlying_symbol_name: 'EUR/USD', market: 'forex', exchange_is_open: 1, is_trading_suspended: 0 },
        { underlying_symbol: 'frxGBPUSD', underlying_symbol_name: 'GBP/USD', market: 'forex', exchange_is_open: 1, is_trading_suspended: 0 },
        { underlying_symbol: 'frxUSDJPY', underlying_symbol_name: 'USD/JPY', market: 'forex', exchange_is_open: 0, is_trading_suspended: 0 },
    ]);
    deriv.getCandles.mockReset().mockResolvedValue([{ time: 1, open: 1, high: 1, low: 1, close: 1 }]);
    sendTelegram.mockReset().mockResolvedValue({ messageId: 55 });
    sendTelegramPhoto.mockReset().mockResolvedValue({ messageId: 56 });
    // By default the picture cannot be drawn, so the tests below keep checking the plain-text message.
    chart.renderChartPng.mockReset().mockImplementation(() => { throw new Error('no chart in this test'); });
    mtf.analyseMtf.mockReset().mockReturnValue(BUY());
    ict.analyseIct.mockReset().mockReturnValue(WAIT()); // the ICT strategy has its own describe block below
});
afterEach(() => { process.env = ENV; if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore(); });

describe('access and switches', () => {
    test('needs the secret and only allows GET/POST', async () => {
        expect((await call({}, { headers: {} })).status).toBe(401);
        expect((await call({}, { method: 'DELETE' })).status).toBe(405);
        expect(deriv.connect).not.toHaveBeenCalled();
    });
    test('MTF_ENABLED=off does nothing at all', async () => {
        process.env.MTF_ENABLED = 'off';
        const r = await call();
        expect(r.body).toMatchObject({ ok: true, disabled: true });
        expect(deriv.connect).not.toHaveBeenCalled();
        expect(sendTelegram).not.toHaveBeenCalled();
    });
    test('Deriv unreachable gives a clear 502 and sends nothing', async () => {
        deriv.connect.mockRejectedValue(new Error('Could not connect to Deriv'));
        expect((await call()).status).toBe(502);
        expect(sendTelegram).not.toHaveBeenCalled();
    });
});

describe('a confirmed signal', () => {
    test('is saved and sent to Telegram with everything you asked for', async () => {
        const r = await call();
        expect(r.status).toBe(200);
        expect(r.body.markets[0]).toMatchObject({ symbol: 'frxEURUSD', signal: 'BUY', saved: true, telegram: 'sent' });
        expect(sendTelegram).toHaveBeenCalledTimes(1);
        const text = sendTelegram.mock.calls[0][0];
        for (const part of ['BUY SIGNAL', 'EUR/USD', 'Mode: M15 direction + M5 entry', 'M15 is bullish', 'closed above 2345.10',
            '2350.5', '2345', '2365', 'Risk : Reward = 1 : 2.64', 'GMT', 'Signals only, not financial advice.']) expect(text).toContain(part);
        const rows = await global.__sql`SELECT strategy_id, strategy_name, timeframe, side, status, telegram_sent FROM signals`;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ strategy_id: 6, strategy_name: 'M15 direction + M5 entry', timeframe: 300, side: 'BUY', status: 'active', telegram_sent: true });
    });
    test('a SELL works the same way', async () => {
        mtf.analyseMtf.mockReturnValue(SELL());
        await call();
        const text = sendTelegram.mock.calls[0][0];
        expect(text).toContain('SELL SIGNAL');
        expect(text).toContain('lower highs and lower lows');
    });
    test('the time in the message is when the confirming M5 candle closed', async () => {
        await call();
        const stamp = new Date(closeOfLast() * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' GMT';
        expect(sendTelegram.mock.calls[0][0]).toContain(stamp);
    });
    test('the explanation text is escaped so it cannot break the message', async () => {
        mtf.analyseMtf.mockReturnValue(BUY({ m15Text: 'M15 <b>bullish</b> & strong' }));
        await call();
        expect(sendTelegram.mock.calls[0][0]).toContain('M15 &lt;b&gt;bullish&lt;/b&gt; &amp; strong');
    });
    test('the analysis gets real candles for both timeframes: 15 minutes and 5 minutes', async () => {
        await call();
        const grans = deriv.getCandles.mock.calls.map(c => c[2]).sort((a, b) => b - a);
        expect(grans).toEqual([900, 300]);
        expect(mtf.analyseMtf).toHaveBeenCalledTimes(1);
    });
});

describe('WAIT is never sent', () => {
    test('nothing is saved or sent, but the report says why', async () => {
        mtf.analyseMtf.mockReturnValue(WAIT());
        const r = await call();
        expect(sendTelegram).not.toHaveBeenCalled();
        expect(await global.__sql`SELECT id FROM signals`).toHaveLength(0);
        expect(r.body.markets[0]).toMatchObject({ signal: 'WAIT', bias: 'unclear' });
        expect(r.body.markets[0].reasons[0]).toMatch(/WAIT \/ NO SIGNAL/);
        expect(r.body.summary.waiting).toBe(1);
    });
    test('a signal without a trade plan is never sent', async () => {
        mtf.analyseMtf.mockReturnValue(BUY({ plan: null }));
        await call();
        expect(sendTelegram).not.toHaveBeenCalled();
    });
    test('bad data (analysis answers WAIT with no signal time) does not move the "last checked" mark', async () => {
        mtf.analyseMtf.mockReturnValue(WAIT({ signalTime: null }));
        await call();
        expect(await global.__sql`SELECT symbol FROM signal_watch_state`).toHaveLength(0);
    });
});

describe('no repeats, no flooding', () => {
    test('no new closed M5 candle since the last check: the market is not even downloaded again', async () => {
        await call();
        deriv.getCandles.mockClear(); mtf.analyseMtf.mockClear();
        const r = await call();
        expect(r.body.markets[0].skipped).toMatch(/no new closed m5 candle/i);
        expect(deriv.getCandles).not.toHaveBeenCalled();
        expect(mtf.analyseMtf).not.toHaveBeenCalled();
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });
    test('while a trade from this mode is open for the market, no second signal', async () => {
        await call();
        mtf.analyseMtf.mockReturnValue(BUY({ signalTime: closeOfLast() + 300 }));
        const r = await call({ force: '1' });
        expect(r.body.markets[0].skipped).toMatch(/still open/i);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });
    test('after the trade closed there is still a cool-down', async () => {
        await call();
        await global.__sql`UPDATE signals SET status = 'hit_sl'`;
        mtf.analyseMtf.mockReturnValue(BUY({ signalTime: closeOfLast() + 300 }));
        const r = await call({ force: '1' });
        expect(r.body.markets[0].skipped).toMatch(/cool-down.*30 minutes/i);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });
    test('with the cool-down off a new confirmation is sent', async () => {
        process.env.MTF_COOLDOWN_MIN = '0';
        await call();
        await global.__sql`UPDATE signals SET status = 'hit_sl'`;
        mtf.analyseMtf.mockReturnValue(BUY({ signalTime: closeOfLast() + 300 }));
        await call({ force: '1' });
        expect(sendTelegram).toHaveBeenCalledTimes(2);
    });
    test('the very same confirmation can never be sent twice', async () => {
        process.env.MTF_COOLDOWN_MIN = '0';
        await call();
        await global.__sql`UPDATE signals SET status = 'hit_sl'`;
        const r = await call({ force: '1' }); // same signalTime
        expect(r.body.markets[0].skipped).toMatch(/duplicate/i);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });
    test('the cool-down is per market', async () => {
        process.env.WATCH_SYMBOLS = 'frxEURUSD,frxGBPUSD';
        await call();
        expect(sendTelegram).toHaveBeenCalledTimes(2);
    });
});

describe('markets and failures', () => {
    test('closed markets and unknown symbols are skipped', async () => {
        process.env.WATCH_SYMBOLS = 'frxUSDJPY,frxNOPE';
        const r = await call();
        expect(r.body.markets.map(m => m.skipped).sort()).toEqual(['Market closed or suspended', 'Not in the Deriv market list']);
        expect(deriv.getCandles).not.toHaveBeenCalled();
    });
    test('one market failing does not stop the others', async () => {
        process.env.WATCH_SYMBOLS = 'frxEURUSD,frxGBPUSD';
        deriv.getCandles.mockRejectedValueOnce(new Error('rate limited'));
        const r = await call();
        expect(r.status).toBe(500);
        expect(r.body.markets.filter(m => m.error)).toHaveLength(1);
        expect(r.body.summary.telegramSent).toBe(1);
    });
    test('Telegram refusing a message keeps the signal and retries it on the next run', async () => {
        sendTelegram.mockRejectedValueOnce(new Error('Telegram refused the message (429): too many requests'));
        const first = await call();
        expect(first.body.markets[0].telegram).toMatch(/failed/);
        expect((await global.__sql`SELECT telegram_sent FROM signals`)[0].telegram_sent).toBe(false);
        mtf.analyseMtf.mockReturnValue(WAIT());
        await call({ force: '1' });
        expect((await global.__sql`SELECT telegram_sent FROM signals`)[0].telegram_sent).toBe(true);
        expect(sendTelegram).toHaveBeenCalledTimes(2);
    });
    test('?dry=1 shows the message that would be sent and saves and sends nothing', async () => {
        const r = await call({ dry: '1' });
        expect(r.body.markets[0].wouldSend).toContain('BUY SIGNAL');
        expect(sendTelegram).not.toHaveBeenCalled();
        expect(await global.__sql`SELECT id FROM signals`).toHaveLength(0);
    });
    test('main markets are checked first, in the priority order', async () => {
        process.env.WATCH_SYMBOLS = 'frxGBPUSD,frxEURUSD';
        process.env.WATCH_PRIORITY = 'frxEURUSD';
        const r = await call({ dry: '1' });
        expect(r.body.markets.map(m => m.symbol)).toEqual(['frxEURUSD', 'frxGBPUSD']);
    });
});

describe('news', () => {
    const ev = (minutes, over = {}) => ({ title: 'Non-Farm Employment Change', country: 'USD', impact: 'High', date: new Date(Date.now() + minutes * 60000).toISOString().replace('Z', '+00:00'), ...over });
    const feed = list => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => list });
    beforeEach(() => { process.env.NEWS_FILTER = 'on'; });

    test('high-impact news around the market holds the signal', async () => {
        feed([ev(45)]);
        const r = await call();
        expect(r.body.markets[0].skipped).toMatch(/news blackout: USD Non-Farm/i);
        expect(r.body.summary.newsHeld).toBe(1);
        expect(sendTelegram).not.toHaveBeenCalled();
        expect(await global.__sql`SELECT id FROM signals`).toHaveLength(0);
    });
    test('news further away only adds a warning line', async () => {
        feed([ev(600)]);
        await call();
        expect(sendTelegram.mock.calls[0][0]).toContain('High-impact news ahead');
    });
    test('if the news feed is down the signal is still sent', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
        const r = await call();
        expect(r.body.news.status).toMatch(/unavailable/);
        expect(r.body.markets[0].telegram).toBe('sent');
    });
});

describe('H1 watcher and M5 signals do not get in each other\'s way', () => {
    const insertM5 = async minutesAgo => {
        await store.ensureTables(global.__sql);
        const id = await store.insertSignal(global.__sql, { key: `x${minutesAgo}`, symbol: 'frxEURUSD', symbolName: 'EUR/USD', market: 'forex', strategyId: 6, strategyName: 'M15 direction + M5 entry', timeframe: 300, side: 'BUY', entry: 1, stopLoss: 0.9, takeProfit: 1.3, rr: 3, time: 1000 });
        await global.__sql`UPDATE signals SET created_at = now() - (${minutesAgo} * interval '1 minute') WHERE id = ${id}`;
        return id;
    };
    test('the H1 watcher never retries an M5 signal (it would be far too old)', async () => {
        await insertM5(1);
        expect(await store.getUnsent(global.__sql)).toHaveLength(0);
        expect(await store.getUnsentMtf(global.__sql)).toHaveLength(1);
    });
    test('an M5 signal that is more than 10 minutes old is no longer retried', async () => {
        await insertM5(20);
        expect(await store.getUnsentMtf(global.__sql)).toHaveLength(0);
    });
});

describe('the message text', () => {
    test('has every part and handles missing optional pieces', () => {
        const t = core.formatMtfTelegram({ side: 'SELL', symbol: 'frxXAUUSD', symbolName: 'Gold/USD', timeframe: 300, entry: 2350.5, stopLoss: 2356, takeProfit: 2335, rr: 2.82, time: Date.UTC(2026, 9, 16, 9, 30) / 1000, m15Text: 'M15 bearish', m5Text: 'M5 closed below 2349' });
        expect(t).toContain('🔴 <b>SELL SIGNAL</b>: Gold/USD');
        expect(t).toContain('2026-10-16 09:35 GMT');
        expect(t).not.toContain('Open the signals page');
        expect(t.endsWith('⚠️ Signals only, not financial advice.')).toBe(true);
    });
});

describe('chart picture and once-per-setup', () => {
    const c5 = () => { const last = Math.floor(nowSec() / 300) * 300; return Array.from({ length: 30 }, (_, i) => ({ time: last - (30 - i) * 300, open: 1, high: 1.1, low: 0.9, close: 1 })); };
    beforeEach(() => { deriv.getCandles.mockReset().mockImplementation(async () => c5()); });

    test('the signal goes out as a chart picture with the text as its caption', async () => {
        chart.renderChartPng.mockReset().mockReturnValue(Buffer.from('png'));
        const r = await call();
        expect(r.body.markets[0]).toMatchObject({ telegram: 'sent', picture: true });
        expect(sendTelegramPhoto).toHaveBeenCalledTimes(1);
        expect(sendTelegramPhoto.mock.calls[0][1]).toContain('Mode: M15 direction + M5 entry');
        expect(sendTelegram).not.toHaveBeenCalled();
        expect(chart.renderChartPng.mock.calls[0][0].signal).toMatchObject({ timeframe: 300, side: 'BUY', entry: 2350.5 });
    });
    test('if the picture fails, the plain text is sent instead (a signal is never lost)', async () => {
        const r = await call();
        expect(r.body.markets[0].picture).toMatch(/^failed/);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });
    test('the same setup keeps the same id on the next candle: it is not sent again', async () => {
        mtf.analyseMtf.mockReturnValue(BUY({ setupId: 'BUY|2345|2350' }));
        await call();
        process.env.MTF_COOLDOWN_MIN = '0'; // even without the cool-down the same setup is not repeated
        mtf.analyseMtf.mockReturnValue(BUY({ setupId: 'BUY|2345|2350', signalTime: closeOfLast() + 300 }));
        const again = await call({ force: '1' });
        expect(again.body.markets[0].skipped).toMatch(/Already sent|open|duplicate/i);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });
    test('dry run shows the picture check and sends nothing', async () => {
        chart.renderChartPng.mockReset().mockReturnValue(Buffer.from('png'));
        const r = await call({ dry: '1' });
        expect(r.body.markets[0].picture).toMatch(/^ok/);
        expect(sendTelegram).not.toHaveBeenCalled();
        expect(sendTelegramPhoto).not.toHaveBeenCalled();
    });
});

describe('ICT strategy (same run, own rules)', () => {
    const ICT_BUY = (over = {}) => BUY({ m5Text: 'ICT confirmed: swept the low 2340, structure shifted above 2348, price returned to the fair value gap 2349 - 2350.', setupId: 'ICT|BUY|2340|2348', ...over });

    test('a confirmed ICT setup is saved as its own strategy and sent with its own name', async () => {
        mtf.analyseMtf.mockReturnValue(WAIT());
        ict.analyseIct.mockReturnValue(ICT_BUY());
        const r = await call();
        expect(r.body.summary.ict).toEqual(expect.objectContaining({ signalsSaved: 1, telegramSent: 1 }));
        expect(r.body.summary.signalsSaved).toBe(0);
        const rows = await global.__sql`SELECT strategy_name, side FROM signals`;
        expect(rows).toEqual([{ strategy_name: 'ICT sweep + shift + gap', side: 'BUY' }]);
        const text = sendTelegram.mock.calls[0][0];
        expect(text).toContain('Mode: ICT sweep + shift + gap');
        expect(text).toContain('fair value gap');
    });

    test('the same ICT setup is never sent twice', async () => {
        mtf.analyseMtf.mockReturnValue(WAIT());
        ict.analyseIct.mockReturnValue(ICT_BUY());
        await call({ force: '1' });
        process.env.MTF_COOLDOWN_MIN = '0';
        const second = await call({ force: '1' });
        expect(second.body.summary.ict.signalsSaved).toBe(0);
        expect(sendTelegram).toHaveBeenCalledTimes(1);
    });

    test('ICT and M15+M5 do not block each other: both can be open on the same market', async () => {
        mtf.analyseMtf.mockReturnValue(BUY());
        ict.analyseIct.mockReturnValue(ICT_BUY());
        const r = await call();
        expect(r.body.summary.signalsSaved).toBe(1);
        expect(r.body.summary.ict.signalsSaved).toBe(1);
        const rows = await global.__sql`SELECT strategy_name FROM signals ORDER BY id`;
        expect(rows.map(x => x.strategy_name)).toEqual(['M15 direction + M5 entry', 'ICT sweep + shift + gap']);
    });

    test('an open ICT trade holds back a second ICT signal on that market, but not an M15+M5 one', async () => {
        mtf.analyseMtf.mockReturnValue(WAIT());
        ict.analyseIct.mockReturnValue(ICT_BUY());
        await call({ force: '1' });
        process.env.MTF_COOLDOWN_MIN = '0';
        ict.analyseIct.mockReturnValue(ICT_BUY({ setupId: 'ICT|BUY|2300|2310' }));
        const r = await call({ force: '1' });
        expect(r.body.markets[0].ict.skipped).toMatch(/still open/);
        mtf.analyseMtf.mockReturnValue(BUY());
        const r2 = await call({ force: '1' });
        expect(r2.body.summary.signalsSaved).toBe(1);
    });

    test('ICT_ENABLED=off leaves ICT out completely', async () => {
        process.env.ICT_ENABLED = 'off';
        mtf.analyseMtf.mockReturnValue(WAIT());
        ict.analyseIct.mockReturnValue(ICT_BUY());
        const r = await call();
        expect(ict.analyseIct).not.toHaveBeenCalled();
        expect(r.body.summary.ict).toBeUndefined();
        expect(sendTelegram).not.toHaveBeenCalled();
    });
});
