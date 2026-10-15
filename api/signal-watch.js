// Signal machine, server side. Called on a schedule (cron-job.org) a few times an hour.
//
// For every market on the watchlist: skip it if closed/suspended or if no new candle has
// closed since its last check, otherwise load candles from Deriv and run the SAME analysis
// the chart uses (api/_lib/engine.js is generated from src/pages/forex-trader/engine.ts).
// Every READY setup that is fresh and meets the minimum RR is saved once (duplicates are
// blocked by the database) and sent to Telegram. The website feed (/api/signals) reads the
// same table.
//
// WATCHLIST: set in the admin page (/signals-admin.html) and stored in the database. If nothing
// has been saved there yet, WATCH_SYMBOLS from the environment is used.
//
// PACING: Deriv allows 220 market-data requests per minute. Markets are checked 3 at a time,
// 1 second apart (about 180 per minute), least recently checked first. If a run reaches its
// time budget the remaining markets are done first on the next run.
//
// Every run also checks the signals that are still open: when one hits its take profit or stop loss
// (or never reaches its entry, or runs out of time) the result is saved and sent to Telegram as a reply
// under the original signal, with what $10 / $20 / $50 risked would have made or lost.
// See api/_lib/signal-outcome.js for the exact rules. Settings: RESULT_STAKES, RESULT_EXPIRY_HOURS.
//
// Protected by SIGNALS_SECRET. Call it with the header   Authorization: Bearer <SIGNALS_SECRET>
// or (easier to set up) with   ?key=<SIGNALS_SECRET>
//
// Extra switches for testing:
//   ?test=1   sends a test message to Telegram and does nothing else
//   ?dry=1    analyses and reports what it WOULD send; sends and saves nothing
//   ?force=1  re-analyses even if no new candle has closed (duplicates are still blocked)
const { getDb } = require('./_lib/db');
const deriv = require('./_lib/deriv');
const { sendTelegram, sendTelegramPhoto } = require('./_lib/telegram');
const chart = require('./_lib/signal-chart');
const engine = require('./_lib/engine');
const core = require('./_lib/signals-core');
const outcomeLib = require('./_lib/signal-outcome');
const store = require('./_lib/signals-store');
const news = require('./_lib/news');
const { authorised } = require('./_lib/signals-auth');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Sends one signal to Telegram: as a chart picture with the signal text as its caption.
 * If the picture cannot be drawn or Telegram refuses it, the plain text message is sent instead,
 * so a signal is never lost because of the picture. Returns { messageId, picture: true|'failed: why' }.
 */
async function deliver(sig, chartInput) {
    const text = core.formatTelegram(sig, { siteUrl: core.signalsPageUrl(), newsNote: sig.newsNote });
    let why = null;
    try {
        const png = chart.renderChartPng(chartInput);
        const sent = await sendTelegramPhoto(png, text);
        return { messageId: sent.messageId, picture: true };
    } catch (err) {
        why = err.message;
        console.error('signal-watch: chart picture failed, sending text only:', why);
    }
    const sent = await sendTelegram(text);
    return { messageId: sent.messageId, picture: `failed: ${why}` };
}

/** Runs Telegram sends one at a time with a pause between them (Telegram limits bursts). */
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

/** Sends the result message for one finished signal, as a reply under the original signal. */
async function sendResult(sql, sig, outcome, resultCfg, send) {
    const text = outcomeLib.formatResult(sig, outcome, { stakes: resultCfg.stakes, siteUrl: core.signalsPageUrl() });
    const sent = await send(() => sendTelegram(text, { replyTo: sig.telegramMessageId }));
    await store.markResultSent(sql, sig.id, sent.messageId);
}

/**
 * Looks at every signal that is still open, decides if it has finished (take profit, stop loss,
 * never entered, or expired) using the candles since it was sent, saves that and sends the result.
 * A problem with one signal never stops the others.
 */
async function trackOpenSignals(sql, client, report, send, skipFetch) {
    const resultCfg = outcomeLib.readResultConfig();
    const now = Math.floor(Date.now() / 1000);
    report.results = [];

    // Results decided earlier that Telegram did not accept are retried first.
    for (const s of await store.getUnsentResults(sql)) {
        const outcome = { status: s.status, enteredTime: s.enteredTime, closedTime: s.closedTime };
        try {
            await sendResult(sql, s, outcome, resultCfg, send);
            report.results.push({ id: s.id, status: s.status, telegram: 'sent (retry)' });
        } catch (err) {
            console.error('signal-watch: result retry failed:', err.message);
        }
    }

    const open = await store.getOpenSignals(sql);
    const groups = new Map();
    for (const s of open) {
        const k = `${s.symbol}|${s.timeframe}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(s);
    }

    for (const sigs of groups.values()) {
        // No new candle has closed since the last check: nothing can have changed, so do not download anything.
        if (skipFetch && skipFetch(sigs[0].symbol, sigs[0].timeframe)) continue;
        let candles;
        try {
            const oldest = Math.min(...sigs.map(x => x.time));
            const days = Math.min(15, Math.max(2, Math.ceil((now - oldest) / 86400) + 1));
            candles = await deriv.getCandles(client, sigs[0].symbol, sigs[0].timeframe, days);
        } catch (err) {
            console.error(`signal-watch: could not load candles to check ${sigs[0].symbol}:`, err.message);
            continue;
        }
        for (const s of sigs) {
            try {
                const outcome = outcomeLib.evaluateSignal(s, candles, now, resultCfg.expirySeconds);
                if (!outcome) continue;
                if (!(await store.closeSignal(sql, s, outcome))) continue; // another run closed it first
                const entry = { id: s.id, symbol: s.symbol, status: outcome.status };
                report.results.push(entry);
                if (!s.telegramSent) { entry.telegram = 'not needed (the signal itself never reached Telegram)'; continue; }
                try {
                    await sendResult(sql, s, outcome, resultCfg, send);
                    entry.telegram = 'sent';
                } catch (err) {
                    entry.telegram = `failed: ${err.message}`; // retried on the next run
                    console.error('signal-watch: result Telegram failed:', err.message);
                }
            } catch (err) {
                console.error(`signal-watch: checking signal ${s.id} failed:`, err.message);
            }
        }
    }
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
    const q = req.query || {};
    const dry = q.dry === '1';
    const force = q.force === '1';

    if (q.test === '1') {
        try {
            await sendTelegram('✅ <b>Test message</b>\nYour signal machine can reach this chat.\n\n⚠️ Signals only, not financial advice.');
            res.status(200).json({ ok: true, telegram: 'sent' });
        } catch (err) {
            res.status(502).json({ ok: false, telegram: err.message });
        }
        return;
    }

    const started = Date.now();
    const cfg = core.readConfig();
    const summary = { watching: 0, analysed: 0, closedOrSuspended: 0, noNewCandle: 0, signalsSaved: 0, telegramSent: 0, newsHeld: 0, errors: 0, deferred: 0 };
    const report = { ok: true, dry, timeframe: cfg.timeframe, minRr: cfg.minRr, summary, markets: [] };

    let client;
    try {
        client = await deriv.connect();
    } catch (err) {
        console.error('signal-watch: Deriv connection failed:', err.message);
        res.status(502).json({ ok: false, error: err.message });
        return;
    }

    try {
        let sql = null;
        try {
            sql = getDb();
            await store.ensureTables(sql);
        } catch (err) {
            if (!dry) throw err; // a dry run can still show the analysis without a database
            sql = null;
        }
        const write = !dry;
        const send = makeSender(cfg.telegramGapMs);

        if (write) {
            // Retry anything saved earlier that Telegram did not accept.
            for (const s of await store.getUnsent(sql)) {
                try {
                    const sent = await send(() => sendTelegram(core.formatTelegram(s, { siteUrl: core.signalsPageUrl() })));
                    await store.markTelegramSent(sql, s.id, sent.messageId);
                } catch (err) {
                    console.error('signal-watch: Telegram retry failed:', err.message);
                }
            }
        }

        const rows = sql ? await store.getWatchlist(sql) : [];
        report.watchlistSource = rows.length ? 'database' : 'environment (WATCH_SYMBOLS)';
        const states = sql ? await store.getStates(sql, cfg.timeframe) : new Map();
        // Least recently checked first, so a run that runs out of time never starves the same markets.
        const symbols = core
            .resolveWatchSymbols(rows, cfg.symbols)
            .sort((a, b) => ((states.get(a) && states.get(a).updatedAt) || 0) - ((states.get(b) && states.get(b).updatedAt) || 0));
        summary.watching = symbols.length;

        if (write) {
            try {
                const expectedNow = core.expectedLastClosed(Math.floor(Date.now() / 1000), cfg.timeframe);
                const skipFetch = (symbol, tf) => !force && tf === cfg.timeframe && states.has(symbol) && states.get(symbol).lastCandle >= expectedNow;
                await trackOpenSignals(sql, client, report, send, skipFetch);
            } catch (err) {
                // Result tracking must never stop new signals from being found.
                report.resultsError = err.message;
                console.error('signal-watch: result tracking failed:', err.message);
            }
        }

        // Economic news (never blocks the run: if the feed is down, signals go out as normal).
        const newsCfg = news.readNewsConfig();
        let newsData = { status: 'off', events: [] };
        if (newsCfg.enabled) newsData = await news.loadEvents(store, sql, newsCfg, { save: write });
        report.news = { status: newsData.status, eventsLoaded: newsData.events.length };

        const active = await deriv.getActiveSymbols(client);
        const bySymbol = new Map(active.map(s => [s.underlying_symbol, s]));
        const expected = core.expectedLastClosed(Math.floor(Date.now() / 1000), cfg.timeframe);

        const processSymbol = async symbol => {
            const entry = { symbol, results: [] };
            report.markets.push(entry);
            try {
                const info = bySymbol.get(symbol);
                if (!info) { entry.skipped = 'Not in the Deriv market list'; return; }
                if (info.exchange_is_open === 0 || info.is_trading_suspended === 1) {
                    entry.skipped = 'Market closed or suspended';
                    summary.closedOrSuspended++;
                    return;
                }
                // Already analysed the newest closed candle? Then do not even download candles.
                const seen = states.get(symbol);
                if (!force && seen && seen.lastCandle >= expected) {
                    entry.skipped = 'No new closed candle since the last check';
                    summary.noNewCandle++;
                    return;
                }

                const candles = await deriv.getCandles(client, symbol, cfg.timeframe);
                const now = Math.floor(Date.now() / 1000);
                const closed = candles.filter(c => c.time + cfg.timeframe <= now);
                const forming = candles.find(c => c.time + cfg.timeframe > now) || null;
                if (!closed.length) { entry.skipped = 'No closed candles yet'; return; }
                const lastClosed = closed[closed.length - 1].time;
                entry.lastClosedCandle = core.gmtStamp(lastClosed);
                summary.analysed++;

                const kind = engine.marketKind(info.market);
                for (const strategyId of cfg.strategies) {
                    const a = engine.analyse(strategyId, closed, kind, forming, now);
                    const r = { strategy: strategyId, state: a.state };
                    entry.results.push(r);
                    if (a.state !== 'ready' || !a.plan) continue;

                    // Only fresh setups: skip one whose BOS happened long ago (for example right after first deploy).
                    const bosTime = a.bos && a.bos.bosTime;
                    const age = bosTime ? Math.round((lastClosed - bosTime) / cfg.timeframe) : 0;
                    r.candlesSinceBos = age;
                    if (age > cfg.maxAgeCandles) { r.skipped = `Setup is ${age} candles old (limit ${cfg.maxAgeCandles})`; continue; }
                    const bad = core.levelsProblem(a.plan);
                    if (bad) { r.skipped = `Impossible trade levels: ${bad}`; continue; }
                    if (a.plan.rr < cfg.minRr) { r.skipped = `RR ${a.plan.rr.toFixed(2)} below minimum ${cfg.minRr}`; continue; }

                    // News: hold the signal around high-impact events, or add a warning line.
                    const ccys = news.currenciesFor(symbol, info.market);
                    const nw = ccys.length && newsData.events.length ? news.check(ccys, newsData.events, now, newsCfg) : {};
                    if (nw.blackout) {
                        r.skipped = `News blackout: ${news.describe(nw.blackout, now)}`;
                        summary.newsHeld++;
                        continue;
                    }

                    const sig = {
                        key: core.dedupeKey(symbol, strategyId, cfg.timeframe, a.plan.side, a.plan.entry),
                        symbol,
                        symbolName: info.underlying_symbol_name,
                        market: info.market,
                        strategyId,
                        strategyName: a.strategyName,
                        timeframe: cfg.timeframe,
                        side: a.plan.side,
                        entry: a.plan.entry,
                        stopLoss: a.plan.stopLoss,
                        takeProfit: a.plan.takeProfit,
                        rr: a.plan.rr,
                        time: lastClosed,
                        newsNote: nw.upcoming ? news.newsNote(nw.upcoming, now) : null,
                    };
                    if (!write) {
                        r.wouldSend = core.formatTelegram(sig, { siteUrl: core.signalsPageUrl(), newsNote: sig.newsNote });
                        try { r.picture = `ok (${chart.renderChartPng({ candles: closed, analysis: a, signal: sig }).length} bytes)`; } catch (err) { r.picture = `would fail: ${err.message}`; }
                        continue;
                    }

                    const id = await store.insertSignal(sql, sig);
                    if (id === null) { r.skipped = 'Already sent before (duplicate)'; continue; }
                    r.saved = true;
                    summary.signalsSaved++;
                    try {
                        const sent = await send(() => deliver(sig, { candles: closed, analysis: a, signal: sig }));
                        await store.markTelegramSent(sql, id, sent.messageId);
                        r.telegram = 'sent';
                        r.picture = sent.picture;
                        summary.telegramSent++;
                    } catch (err) {
                        // Saved on the website feed; Telegram is retried on the next run.
                        r.telegram = `failed: ${err.message}`;
                        console.error('signal-watch: Telegram failed:', err.message);
                    }
                }
                if (write) await store.setLastCandle(sql, symbol, cfg.timeframe, lastClosed);
            } catch (err) {
                entry.error = err.message;
                report.ok = false;
                summary.errors++;
                console.error(`signal-watch: ${symbol} failed:`, err.message);
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
        console.error('signal-watch: run failed:', err.message);
    } finally {
        client.close();
    }

    report.elapsedMs = Date.now() - started;
    res.status(report.ok ? 200 : 500).json(report);
};
