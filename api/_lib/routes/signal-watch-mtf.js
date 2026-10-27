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
//   - Previous Day High/Low rejection (api/_lib/pdh.js): a WATCH alert when price touches yesterday's high/low after an Institutional
//     Footprint (once per level per market per day: "do not enter yet"), then the entry when the Rejection Candle forms. MTF_PDH=off switches it off.
//   - Liquidity Grab Reversal (api/_lib/grab.js): OFF unless GRAB_ENABLED=on. A WATCH alert when a day extreme is taken with an Institutional Footprint,
//     then the signal when an M5 candle touches the stop-hunt line and closes back inside. No stop loss; take profit = GRAB_TP_STAKES x the stake.
//   - the ICT strategy (sweep + structure shift + fair value gap, api/_lib/ict.js) runs on the same candles in the same run, with its own
//     open-trade and cool-down checks. ICT_ENABLED=off switches only ICT off.
//
// Protected by SIGNALS_SECRET: header   Authorization: Bearer <SIGNALS_SECRET>   or   ?key=<SIGNALS_SECRET>
// Testing:  ?dry=1 shows what it would send (nothing is sent or saved)   ?force=1 re-analyses even without a new candle
const { getDb } = require('../db');
const deriv = require('../deriv');
const { sendTelegram } = require('../telegram');
const chart = require('../signal-chart');
const { deliverSignal } = require('../signal-deliver');
const mtf = require('../mtf');
const ict = require('../ict');
const pdhMod = require('../pdh');
const grabMod = require('../grab');
const grabTg = require('../grab-telegram');
const core = require('../signals-core');
const store = require('../signals-store');
const news = require('../news');
const { authorised } = require('../signals-auth');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MTF_TF = 300;
const MTF_STRATEGY_ID = 6;
const MTF_STRATEGY_NAME = 'M15 direction + M5 entry';
const ICT_STRATEGY_ID = 7;
const ICT_STRATEGY_NAME = 'ICT sweep + shift + gap';
const PDH_STRATEGY_ID = 8;
const PDH_STRATEGY_NAME = 'Previous Day High/Low rejection';

const numOr = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

/** The Previous Day High/Low result in the shape the shared signal loop expects (it is only a trade when the Rejection Candle has formed). */
function pdhAsRun(p) {
    const ok = p.stage === 'confirmed' && p.plan && p.rejection;
    return {
        signal: ok ? p.plan.side : 'WAIT',
        bias: p.side === 'BUY' ? 'bullish' : p.side === 'SELL' ? 'bearish' : 'unclear',
        plan: ok ? { side: p.plan.side, entry: p.plan.entry, stopLoss: p.plan.stopLoss, takeProfit: p.plan.takeProfit, rr: p.plan.rr } : null,
        setupId: ok ? `${p.plan.side}|${p.rejection.time}` : null,
        signalTime: p.signalTime,
        m15Text: p.headline,
        m5Text: p.reasons[p.reasons.length - 1] || '',
        reasons: p.reasons,
    };
}

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
    const ictEnabled = String(process.env.ICT_ENABLED || 'on').toLowerCase() !== 'off';
    // Previous Day High/Low rejection: a WATCH alert at the touch, then the entry at the Rejection Candle. MTF_PDH=off switches only this off.
    const pdhEnabled = String(process.env.MTF_PDH || 'on').toLowerCase() !== 'off';
    const grabEnabled = String(process.env.GRAB_ENABLED || 'off').toLowerCase() === 'on';
    const grabCfg = grabTg.readGrabConfig();
    const summary = { watching: 0, analysed: 0, closedOrSuspended: 0, noNewCandle: 0, waiting: 0, signalsSaved: 0, telegramSent: 0, newsHeld: 0, errors: 0, deferred: 0 };
    if (ictEnabled) summary.ict = { waiting: 0, signalsSaved: 0, telegramSent: 0, newsHeld: 0 };
    if (pdhEnabled) summary.pdh = { waiting: 0, signalsSaved: 0, telegramSent: 0, newsHeld: 0, alerts: 0 };
    if (grabEnabled) summary.grab = { waiting: 0, signals: 0, alerts: 0, newsHeld: 0 };
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
        const openNow = new Set(sql ? (await store.getOpenSignals(sql)).filter(s => s.timeframe === MTF_TF).map(s => `${s.symbol}|${s.strategyName}`) : []);

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

                const runs = [{ id: MTF_STRATEGY_ID, name: MTF_STRATEGY_NAME, a, out: entry }];
                if (ictEnabled) {
                    const ia = ict.analyseIct(c15, c5, now);
                    entry.ict = { signal: ia.signal, bias: ia.bias, m5: ia.m5Text };
                    runs.push({ id: ICT_STRATEGY_ID, name: ICT_STRATEGY_NAME, a: ia, out: entry.ict });
                }
                let pdhResult = null;
                if (pdhEnabled) {
                    pdhResult = pdhMod.analysePreviousDay(c15, c5, now);
                    entry.pdh = { stage: pdhResult.stage, headline: pdhResult.headline };
                    runs.push({ id: PDH_STRATEGY_ID, name: PDH_STRATEGY_NAME, a: pdhAsRun(pdhResult), out: entry.pdh });

                    // Heads-up when price touches the level (after an Institutional Footprint). Not a trade: "do not enter yet". Once per level per market per day.
                    if (pdhResult.stage === 'watch' && pdhResult.alertKey) {
                        const wc = news.currenciesFor(symbol, info.market);
                        const wn = wc.length && newsData.events.length ? news.check(wc, newsData.events, now, newsCfg) : {};
                        const alertText = core.formatPdhWatchTelegram(pdhResult, info.underlying_symbol_name, { siteUrl: core.signalsPageUrl(), newsNote: wn.upcoming ? news.newsNote(wn.upcoming, now) : null });
                        if (!write) {
                            entry.pdh.wouldAlert = alertText;
                        } else {
                            const alertKey = `${symbol}|pdh-watch|${pdhResult.alertKey}`;
                            if (await store.claimAlert(sql, alertKey)) {
                                try {
                                    await send(() => sendTelegram(alertText));
                                    entry.pdh.alert = 'sent';
                                    summary.pdh.alerts++;
                                } catch (err) {
                                    await store.releaseAlert(sql, alertKey); // let the next run try again
                                    entry.pdh.alert = `failed: ${err.message}`;
                                    console.error('signal-watch-mtf: PDH alert failed:', err.message);
                                }
                            } else {
                                entry.pdh.alert = 'already sent today for this level';
                            }
                        }
                    }
                }
                if (grabEnabled) {
                    entry.grab = {};
                    try {
                        const g5 = (await deriv.getCandles(client, symbol, 300, 3)).filter(c => c.time + MTF_TF <= now);
                        const gr = grabMod.analyseGrab(g5, now, require('../engine').marketKind(info.market));
                        entry.grab = { stage: gr.stage, headline: gr.headline };
                        if (gr.stage === 'none') summary.grab.waiting++;
                        else {
                            const gc = news.currenciesFor(symbol, info.market);
                            const gn = gc.length && newsData.events.length ? news.check(gc, newsData.events, now, newsCfg) : {};
                            const newsNote = gn.upcoming ? news.newsNote(gn.upcoming, now) : null;
                            const isSignal = gr.stage === 'signal';
                            const tp = isSignal ? grabTg.targets(gr.side, gr.entry, grabCfg) : null;
                            const text = isSignal ? grabTg.formatGrabSignal(gr, info.underlying_symbol_name, grabCfg, { siteUrl: core.signalsPageUrl(), newsNote }) : grabTg.formatGrabWatch(gr, info.underlying_symbol_name, { siteUrl: core.signalsPageUrl(), newsNote });
                            const input = { candles: g5, result: gr, symbolName: info.underlying_symbol_name, cfg: grabCfg, tp };
                            const alertKey = `${symbol}|grab-${isSignal ? 'signal' : 'watch'}|${isSignal ? gr.setupId : gr.alertKey}`;
                            if (isSignal && gn.blackout) {
                                entry.grab.skipped = `News blackout: ${news.describe(gn.blackout, now)}`;
                                summary.grab.newsHeld++;
                            } else if (!write) {
                                entry.grab.wouldSend = text;
                                if (isSignal) { try { entry.grab.picture = `ok (${require('../signal-chart-grab').renderGrabPng(input).length} bytes)`; } catch (err) { entry.grab.picture = `would fail: ${err.message}`; } }
                            } else if (isSignal && grabCfg.cooldownMin > 0 && (await store.hasRecentAlert(sql, `${symbol}|grab-signal|`, grabCfg.cooldownMin))) {
                                entry.grab.skipped = `Cool-down: a stop-hunt signal was already sent for this market in the last ${grabCfg.cooldownMin} minutes`;
                            } else if (await store.claimAlert(sql, alertKey)) {
                                try {
                                    if (isSignal) await send(() => grabTg.deliverGrab(text, input));
                                    else await send(() => sendTelegram(text));
                                    entry.grab.sent = true;
                                    if (isSignal) summary.grab.signals++; else summary.grab.alerts++;
                                } catch (err) {
                                    await store.releaseAlert(sql, alertKey);
                                    entry.grab.sent = `failed: ${err.message}`;
                                    console.error('signal-watch-mtf: grab send failed:', err.message);
                                }
                            } else {
                                entry.grab.skipped = 'Already sent before';
                            }
                        }
                    } catch (err) {
                        entry.grab.error = err.message;
                        console.error(`signal-watch-mtf: grab ${symbol} failed:`, err.message);
                    }
                }
                for (const run of runs) {
                    const { a: ra, out } = run;
                    const isIct = run.id === ICT_STRATEGY_ID;
                    const isPdh = run.id === PDH_STRATEGY_ID;
                    const count = isIct ? summary.ict : isPdh ? summary.pdh : summary;
                    out.reasons = ra.reasons;
                    if (ra.signal === 'WAIT' || !ra.plan) {
                        count.waiting++;
                        continue;
                    }
                    const ccys = news.currenciesFor(symbol, info.market);
                    const nw = ccys.length && newsData.events.length ? news.check(ccys, newsData.events, now, newsCfg) : {};
                    if (openNow.has(`${symbol}|${run.name}`)) {
                        out.skipped = 'A trade from this strategy is still open for this market';
                    } else if (nw.blackout) {
                        out.skipped = `News blackout: ${news.describe(nw.blackout, now)}`;
                        count.newsHeld = (count.newsHeld || 0) + 1;
                    } else if (!dry && cooldownMin > 0 && (await store.hasRecentSignal(sql, symbol, MTF_TF, cooldownMin, run.name))) {
                        out.skipped = `Cool-down: a signal was already sent for this market in the last ${cooldownMin} minutes`;
                    } else {
                        const sig = {
                            // one signal per setup: the setup id stays the same while the same setup is still valid (older analysis results without one: per confirming candle)
                            key: `${symbol}|${isIct ? 'ict' : isPdh ? 'pdh' : 'mtf'}|${ra.setupId || `${ra.plan.side}|${ra.signalTime}`}`,
                            symbol,
                            symbolName: info.underlying_symbol_name,
                            market: info.market,
                            strategyId: run.id,
                            strategyName: run.name,
                            timeframe: MTF_TF,
                            side: ra.plan.side,
                            entry: ra.plan.entry,
                            stopLoss: ra.plan.stopLoss,
                            takeProfit: ra.plan.takeProfit,
                            rr: ra.plan.rr,
                            time: lastClosedM5,
                            m15Text: ra.m15Text,
                            m5Text: ra.m5Text,
                            newsNote: nw.upcoming ? news.newsNote(nw.upcoming, now) : null,
                            ...(isPdh
                                ? {
                                      takeProfit2: pdhResult.plan.takeProfit2,
                                      levelName: pdhResult.levelName,
                                      levelPrice: pdhResult.levelPrice,
                                      footprintCount: pdhResult.footprint.count,
                                      sweepPrice: pdhResult.sweep ? pdhResult.sweep.price : pdhResult.levelPrice,
                                      rejectionClose: pdhResult.rejection.close,
                                  }
                                : {}),
                        };
                        const text = () => (isPdh ? core.formatPdhEntryTelegram(sig, { siteUrl: core.signalsPageUrl(), newsNote: sig.newsNote }) : core.formatMtfTelegram(sig, { siteUrl: core.signalsPageUrl(), newsNote: sig.newsNote }));
                        const chartInput = { candles: closed5.slice(-120), analysis: {}, signal: sig };
                        if (!write) {
                            out.wouldSend = text();
                            try { out.picture = `ok (${chart.renderChartPng(chartInput).length} bytes)`; } catch (err) { out.picture = `would fail: ${err.message}`; }
                        } else {
                            const id = await store.insertSignal(sql, sig);
                            if (id === null) {
                                out.skipped = 'Already sent before (duplicate)';
                            } else {
                                out.saved = true;
                                count.signalsSaved++;
                                openNow.add(`${symbol}|${run.name}`);
                                try {
                                    const sent = await send(() => deliverSignal(text(), chartInput));
                                    await store.markTelegramSent(sql, id, sent.messageId);
                                    out.telegram = 'sent';
                                    out.picture = sent.picture;
                                    count.telegramSent++;
                                } catch (err) {
                                    out.telegram = `failed: ${err.message}`;
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
