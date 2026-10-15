// Backtest: replays history through the live engine and live setup checks and reports which
// strategies / markets / sessions / stop sizes actually made money. Protected by SIGNALS_SECRET.
// Nothing is sent to Telegram and nothing is saved.
//
//   /api/signal-backtest?key=SECRET
//        &symbols=frxEURUSD,frxGBPUSD   markets to test (default: your saved watchlist)
//        &markets=forex,indices         only these Deriv market groups (forex, indices, commodities,
//                                       cryptocurrency, synthetic_index)
//        &days=120                      how many days to replay (default 120, newest data)
//        &tf=3600                       candle size in seconds (default: the live timeframe)
//        &strategies=1,2,3              (default: the live strategies)
//        &minRr=2 &maxAge=3             what-if: override the live minimum reward / freshness
//        &minStopAtr=0.5 &maxRr=8       what-if: skip too-tight stops / too-good-to-be-true rewards
//        &trades=1                      also list the latest 100 trades
const { getDb } = require('./_lib/db');
const deriv = require('./_lib/deriv');
const core = require('./_lib/signals-core');
const store = require('./_lib/signals-store');
const bt = require('./_lib/backtest');
const { readResultConfig } = require('./_lib/signal-outcome');
const { authorised } = require('./_lib/signals-auth');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_SYMBOLS = 60;
const BUDGET_MS = 48000;

const numOr = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!authorised(req)) { res.status(401).json({ error: 'Unauthorised' }); return; }

    const started = Date.now();
    const q = req.query || {};
    const live = core.readConfig();
    const timeframe = Math.max(60, numOr(q.tf, live.timeframe));
    const days = Math.min(300, Math.max(5, numOr(q.days, 120)));
    const strategies = q.strategies ? String(q.strategies).split(',').map(Number).filter(n => n >= 1 && n <= 5) : live.strategies;
    const cfg = { ...live, timeframe, minRr: numOr(q.minRr, live.minRr), maxAgeCandles: numOr(q.maxAge, live.maxAgeCandles) };
    const filters = { minStopAtr: numOr(q.minStopAtr, 0), maxRr: numOr(q.maxRr, 0) };
    const { expirySeconds } = readResultConfig();

    let client;
    try {
        client = await deriv.connect();
    } catch (err) {
        res.status(502).json({ ok: false, error: err.message });
        return;
    }

    const out = { ok: true, timeframe, daysRequested: days, strategies, settings: { minRr: cfg.minRr, maxAgeCandles: cfg.maxAgeCandles, ...filters }, symbolsTested: 0, skipped: [], unfinished: [] };
    const trades = [];
    try {
        const active = await deriv.getActiveSymbols(client);
        const info = new Map(active.map(s => [s.underlying_symbol, s]));

        let symbols;
        if (q.symbols) {
            symbols = String(q.symbols).split(',').map(s => s.trim()).filter(Boolean);
        } else {
            const sql = getDb();
            await store.ensureTables(sql);
            symbols = core.resolveWatchSymbols(await store.getWatchlist(sql), live.symbols);
        }
        if (q.markets) {
            const only = new Set(String(q.markets).split(',').map(s => s.trim().toLowerCase()));
            symbols = symbols.filter(s => info.get(s) && only.has(String(info.get(s).market).toLowerCase()));
        }
        symbols = Array.from(new Set(symbols));
        if (symbols.length > MAX_SYMBOLS) {
            out.skipped.push({ reason: `Only ${MAX_SYMBOLS} markets per run: ${symbols.length - MAX_SYMBOLS} left out. Use &symbols= or &markets= to split the test.` });
            symbols = symbols.slice(0, MAX_SYMBOLS);
        }

        const window = bt.historyCandles(timeframe);
        const one = async symbol => {
            const meta = info.get(symbol);
            if (!meta) { out.skipped.push({ symbol, reason: 'Not in the Deriv market list' }); return; }
            const nowSec = Math.floor(Date.now() / 1000);
            const raw = await deriv.getCandles(client, symbol, timeframe, 15 + days);
            const candles = raw.filter(c => c.time + timeframe <= nowSec); // closed candles only
            if (candles.length < window + 1) { out.skipped.push({ symbol, reason: `Only ${candles.length} candles available` }); return; }
            const found = bt.runBacktest({
                symbol, symbolName: meta.underlying_symbol_name, market: meta.market, candles, timeframe, strategies, cfg, filters, expirySeconds, window,
            });
            trades.push(...found);
            out.symbolsTested++;
        };

        for (let i = 0; i < symbols.length; i += live.concurrency) {
            if (Date.now() - started > BUDGET_MS) { out.unfinished = symbols.slice(i); break; }
            const batch = symbols.slice(i, i + live.concurrency);
            const settled = await Promise.allSettled(batch.map(one));
            settled.forEach((r, k) => { if (r.status === 'rejected') out.skipped.push({ symbol: batch[k], reason: r.reason && r.reason.message }); });
            if (i + live.concurrency < symbols.length) await sleep(live.batchGapMs);
        }
    } catch (err) {
        console.error('signal-backtest failed:', err.message);
        out.ok = false;
        out.error = err.message;
    } finally {
        client.close();
    }

    Object.assign(out, bt.buildReport(trades));
    if (out.unfinished.length) out.notes.push(`Time ran out: ${out.unfinished.length} markets were not tested. Run again with &symbols=${out.unfinished.slice(0, 12).join(',')}`);
    if (q.trades === '1') out.latestTrades = trades.sort((a, b) => b.time - a.time).slice(0, 100).map(t => ({ ...t, stopAtr: t.stopAtr === null ? null : Math.round(t.stopAtr * 100) / 100, rr: Math.round(t.rr * 100) / 100 }));
    out.elapsedMs = Date.now() - started;
    res.status(out.ok ? 200 : 500).json(out);
};
