// Signal machine, "M15 direction + M5 entry" mode. Called every 5 minutes by a cron service.
//
// For every watched market that is open: load the real M15 and M5 candles from Deriv and run the
// multi-timeframe analysis (api/_lib/mtf.js, generated from src/pages/forex-trader/mtf.ts, the same code
// as the Forex Trader page). Only a confirmed BUY or SELL is saved and sent to Telegram; WAIT is
// never sent. This is a separate mode: the H1 watcher (signal-watch.js) is not changed by it.
//
// Safety rules:
//   - closed candles only (the analysis ignores the candle that is still forming)
//   - no trade is sent when data is missing, old, or out of order (the analysis answers WAIT)
//   - one open M15 + M5 trade per market at a time, and a cool-down after each signal (MTF_COOLDOWN_MIN, 30)
//   - the same confirmation can never be sent twice (database duplicate check)
//   - high-impact news around the market holds the signal, like in the H1 mode
//   - MTF_ENABLED=off switches this mode off completely
//
// Protected by SIGNALS_SECRET: header   Authorization: Bearer <SIGNALS_SECRET>   or   ?key=<SIGNALS_SECRET>
// Testing:  ?dry=1 shows what it would send (nothing is sent or saved)   ?force=1 re-analyses even without a new candle
const { getDb } = require('./_lib/db');
const deriv = require('./_lib/deriv');
const { sendTelegram } = require('./_lib/telegram');
const chart = require('./_lib/signal-chart');
const { deliverSignal } = require('./_lib/signal-deliver');
const mtf = require('./_lib/mtf');
const core = require('./_lib/signals-core');
const store = require('./_lib/signals-store');
const news = require('./_lib/news');
const { authorised } = require('./_lib/signals-auth');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MTF_TF = 300;
const MTF_STRATEGY_ID = 6;
const MTF_STRATEGY_NAME = 'M15 direction + M5 entry';

const numOr = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

/** Telegram messages one at a time, with a pause between them. */
function makeSender(gapMs) {
    let chain = Promise.resolve();
    let first = true;
    return task => {
        const run = chain.then(async () => {
            if (!first && gapMs) await sleep(gapMs);
            first = false;
            return task();
        });
        chain = run.catch(() => {});
        return run;
    };
}

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    if (!authorised(req)) {
        res.status(401).json({ error: 'Unauthorised' });
        return;
    }
    if (String(process.env.MTF_ENABLED || 'on').toLowerCase() === 'off') {
        res.status(200).json({ ok: true, disabled: true, note: 'MTF_ENABLED=off: the M15 + M5 mode is switched off.' });
        return;
    }
    const q = req.query || {};
    const dry = q.dry === '1';
    const force = q.force === '1';
    const started = Date.now();
    const cfg = core.readConfig();
    const cooldownMin = Math.max(0, numOr(process.env.MTF_COOLDOWN_MIN, 30));
    const summary = { watching: 0, analysed: 0, closedOrSuspended: 0, noNewCandle: 0, waiting: 0, signalsSaved: 0, telegramSent: 0, newsHeld: 0, errors: 0, deferred: 0 };
    const report = { ok: true, dry, mode: 'M15 direction + M5 entry', summary, markets: [] };

    let client;
    try {
        client = await deriv.connect();
    } catch (err) {
        console.error('signal-watch-mtf: Deriv connection failed:', err.message);
        res.status(502).json({ ok: false, error: err.message });
        return;
    }

    try {
        let sql = null;
        try {
            sql = getDb();
            await store.ensureTables(sql);
        } catch (err) {
            if (!dry) throw err;
            sql = null;
        }
        const write = !dry;
        const send = makeSender(cfg.telegramGapMs);

        if (write) {
            // Retry an M5 signal that Telegram refused a moment ago (only while it is still fresh).
            for (const s of await store.getUnsentMtf(sql)) {
                try {
                    const sent = await send(() => sendTelegram(core.formatTelegram(s, { siteUrl: core.signalsPageUrl() })));
                    await store.markTelegramSent(sql, s.id, sent.messageId);
                } catch (err) {
                    console.error('signal-watch-mtf: Telegram retry failed:', err.message);
                }
            }
        }

        const rows = sql ? await store.getWatchlist(sql) : [];
        report.watchlistSource = rows.length ? 'database' : 'environment (WATCH_SYMBOLS)';
        const states = sql ? await store.getStates(sql, MTF_TF) : new Map();
        const symbols = core.orderForRun(core.resolveWatchSymbols(rows, cfg.symbols), cfg.priority, states);
        summary.watching = symbols.length;
        const openNow = new Set(sql ? (await store.getOpenSignals(sql)).filter(s => s.timeframe === MTF_TF).map(s => s.symbol) : []);

        const newsCfg = news.readNewsConfig();
        let newsData = { status: 'off', events: [] };
        if (newsCfg.enabled) newsData = await news.loadEvents(store, sql, newsCfg, { save: write });
        report.news = { status: newsData.status, eventsLoaded: newsData.events.length };

        const active = await deriv.getActiveSymbols(client);
        const bySymbol = new Map(active.map(s => [s.underlying_symbol, s]));
        const expected = core.expectedLastClosed(Math.floor(Date.now() / 1000), MTF_TF);

        const processSymbol = async symbol => {
            const entry = { symbol };
            report.markets.push(entry);
            try {
                const info = bySymbol.get(symbol);
                if (!info) { entry.skipped = 'Not in the Deriv market list'; return; }
                if (info.exchange_is_open === 0 || info.is_trading_suspended === 1) {
                    entry.skipped = 'Market closed or suspended';
                    summary.closedOrSuspended++;
                    return;
                }
                const seen = states.get(symbol);
                if (!force && seen && seen.lastCandle >= expected) {
                    entry.skipped = 'No new closed M5 candle since the last check';
                    summary.noNewCandle++;
                    return;
                }

                const [c15, c5] = await Promise.all([deriv.getCandles(client, symbol, 900, 5), deriv.getCandles(client, symbol, 300, 2)]);
                const now = Math.floor(Date.now() / 1000);
                const a = mtf.analyseMtf(c15, c5, now);
                const closed5 = c5.filter(c => c.time + MTF_TF <= now);
                summary.analysed++;
                entry.signal = a.signal;
                entry.bias = a.bias;
                entry.m15 = a.m15Text;
                entry.m5 = a.m5Text;
                const lastClosedM5 = a.signalTime ? a.signalTime - MTF_TF : null; // open time of the latest closed M5 candle

                if (a.signal === 'WAIT' || !a.plan) {
                    summary.waiting++;
                    entry.reasons = a.reasons;
                } else {
                    entry.reasons = a.reasons;
                    const ccys = news.currenciesFor(symbol, info.market);
                    const nw = ccys.length && newsData.events.length ? news.check(ccys, newsData.events, now, newsCfg) : {};
                    if (openNow.has(symbol)) {
                        entry.skipped = 'A trade from this mode is still open for this market';
                    } else if (nw.blackout) {
                        entry.skipped = `News blackout: ${news.describe(nw.blackout, now)}`;
                        summary.newsHeld++;
                    } else if (!dry && cooldownMin > 0 && (await store.hasRecentSignal(sql, symbol, MTF_TF, cooldownMin))) {
                        entry.skipped = `Cool-down: a signal was already sent for this market in the last ${cooldownMin} minutes`;
                    } else {
                        const sig = {
                            // one signal per setup: the setup id stays the same while the same setup is still valid (older analysis results without one: per confirming candle)
                            key: `${symbol}|mtf|${a.setupId || `${a.plan.side}|${a.signalTime}`}`,
                            symbol,
                            symbolName: info.underlying_symbol_name,
                            market: info.market,
                            strategyId: MTF_STRATEGY_ID,
                            strategyName: MTF_STRATEGY_NAME,
                            timeframe: MTF_TF,
                            side: a.plan.side,
                            entry: a.plan.entry,
                            stopLoss: a.plan.stopLoss,
                            takeProfit: a.plan.takeProfit,
                            rr: a.plan.rr,
                            time: lastClosedM5,
                            m15Text: a.m15Text,
                            m5Text: a.m5Text,
                            newsNote: nw.upcoming ? news.newsNote(nw.upcoming, now) : null,
                        };
                        const text = () => core.formatMtfTelegram(sig, { siteUrl: core.signalsPageUrl(), newsNote: sig.newsNote });
                        const chartInput = { candles: closed5.slice(-120), analysis: {}, signal: sig };
                        if (!write) {
                            entry.wouldSend = text();
                            try { entry.picture = `ok (${chart.renderChartPng(chartInput).length} bytes)`; } catch (err) { entry.picture = `would fail: ${err.message}`; }
                        } else {
                            const id = await store.insertSignal(sql, sig);
                            if (id === null) {
                                entry.skipped = 'Already sent before (duplicate)';
                            } else {
                                entry.saved = true;
                                summary.signalsSaved++;
                                openNow.add(symbol);
                                try {
                                    const sent = await send(() => deliverSignal(text(), chartInput));
                                    await store.markTelegramSent(sql, id, sent.messageId);
                                    entry.telegram = 'sent';
                                    entry.picture = sent.picture;
                                    summary.telegramSent++;
                                } catch (err) {
                                    entry.telegram = `failed: ${err.message}`;
                                    console.error('signal-watch-mtf: Telegram failed:', err.message);
                                }
                            }
                        }
                    }
                }
                if (write && lastClosedM5) await store.setLastCandle(sql, symbol, MTF_TF, lastClosedM5);
            } catch (err) {
                entry.error = err.message;
                report.ok = false;
                summary.errors++;
                console.error(`signal-watch-mtf: ${symbol} failed:`, err.message);
            }
        };

        for (let i = 0; i < symbols.length; i += cfg.concurrency) {
            if (Date.now() - started > cfg.budgetMs) {
                summary.deferred = symbols.length - i;
                report.deferredFirst = symbols.slice(i, i + 10);
                break;
            }
            await Promise.all(symbols.slice(i, i + cfg.concurrency).map(processSymbol));
            if (i + cfg.concurrency < symbols.length) await sleep(cfg.batchGapMs);
        }
    } catch (err) {
        report.ok = false;
        report.error = err.message;
        console.error('signal-watch-mtf: run failed:', err.message);
    } finally {
        client.close();
    }

    report.elapsedMs = Date.now() - started;
    res.status(report.ok ? 200 : 500).json(report);
};
