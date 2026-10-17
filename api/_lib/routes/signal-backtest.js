// Backtest: replays history through the live engine and live setup checks and reports which
// strategies / markets / sessions / stop sizes actually made money. Protected by SIGNALS_SECRET.
// Nothing is sent to Telegram and nothing is saved.
//
//   /api/signal-backtest?key=SECRET
//        &symbols=frxEURUSD,frxGBPUSD   markets to test (default: your saved watchlist)
//        &markets=forex,indices         only these Deriv market groups (forex, indices, commodities,
//                                       cryptocurrency, synthetic_index)
//        &days=180                      how many days to replay (default 180, up to 730 = 2 years)
//        &tf=3600                       candle size in seconds (default: the live timeframe)
//        &strategies=1,2,3              (default: the live strategies)
//        &minRr=2 &maxAge=3             what-if: override the live minimum reward / freshness
//        &minStopAtr=0 &maxRr=8         what-if: override the live minimum stop size in ATR (0 = off) / reward cap
//        &trades=1                      also list the latest 100 trades
//        &mode=mtf                      test the M15 direction + M5 entry mode instead of the H1 strategies (default 30 days, up to 90)
//        &mode=ict                      test the ICT strategy (sweep + structure shift + fair value gap), same data and rules as mode=mtf
//        &cooldown=30                   (mode=mtf) minutes before the same market can signal again (default: MTF_COOLDOWN_MIN, 30)
const { getDb } = require('../db');
const deriv = require('../deriv');
const core = require('../signals-core');
const store = require('../signals-store');
const bt = require('../backtest');
const { readResultConfig } = require('../signal-outcome');
const { authorised } = require('../signals-auth');

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
    const ictMode = q.mode === 'ict';
    const mtfMode = q.mode === 'mtf' || ictMode; // both use M5 candles with the M15 direction
    const timeframe = mtfMode ? 300 : Math.max(60, numOr(q.tf, live.timeframe));
    const days = mtfMode ? Math.min(90, Math.max(5, numOr(q.days, 30))) : Math.min(730, Math.max(5, numOr(q.days, 180)));
    const strategies = q.strategies ? String(q.strategies).split(',').map(Number).filter(n => n >= 1 && n <= 5) : live.strategies;
    const cfg = {
        ...live, timeframe, minRr: numOr(q.minRr, live.minRr), maxAgeCandles: numOr(q.maxAge, live.maxAgeCandles),
        minStopAtr: numOr(q.minStopAtr, live.minStopAtr), maxRr: numOr(q.maxRr, live.maxRr),
    };
    const { expirySeconds } = readResultConfig();

    let client;
    try {
        client = await deriv.connect();
    } catch (err) {
        res.status(502).json({ ok: false, error: err.message });
        return;
    }

    const out = { ok: true, mode: ictMode ? 'ict (sweep + shift + gap)' : mtfMode ? 'mtf (M15 direction + M5 entry)' : 'h1 strategies', timeframe, daysRequested: days, strategies, settings: { minRr: cfg.minRr, maxAgeCandles: cfg.maxAgeCandles, minStopAtr: cfg.minStopAtr, maxRr: cfg.maxRr }, symbolsTested: 0, skipped: [], unfinished: [], coverage: [] };
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
        const oneMtf = async (symbol, meta) => {
            const nowSec = Math.floor(Date.now() / 1000);
            const stats = {};
            const rawM5 = await deriv.getCandlesBack(client, symbol, 300, 2 + days, stats);
            const rawM15 = await deriv.getCandlesBack(client, symbol, 900, 6 + days);
            const m5 = rawM5.filter(c => c.time + 300 <= nowSec);
            const m15 = rawM15.filter(c => c.time + 900 <= nowSec);
            out.coverage.push({
                symbol, candles: m5.length, requested: stats.wanted, pages: stats.pages, m15Candles: m15.length,
                from: m5.length ? core.gmtStamp(m5[0].time) : null, to: m5.length ? core.gmtStamp(m5[m5.length - 1].time + 300) : null,
                daysReplayed: Math.max(0, Math.round(((m5.length - 100) * 300) / 86400)),
            });
            if (m5.length < 101 || m15.length < 60) { out.skipped.push({ symbol, reason: `Only ${m5.length} M5 and ${m15.length} M15 candles available` }); return; }
            trades.push(...bt.runMtfBacktest({ symbol, symbolName: meta.underlying_symbol_name, market: meta.market, m5, m15, expirySeconds, strategy: ictMode ? 'ict' : 'mtf', cooldownMinutes: Math.max(0, numOr(q.cooldown, numOr(process.env.MTF_COOLDOWN_MIN, 30))) }));
            out.symbolsTested++;
        };
        const one = async symbol => {
            const meta = info.get(symbol);
            if (!meta) { out.skipped.push({ symbol, reason: 'Not in the Deriv market list' }); return; }
            if (mtfMode) return oneMtf(symbol, meta);
            const nowSec = Math.floor(Date.now() / 1000);
            const stats = {};
            const raw = await deriv.getCandlesBack(client, symbol, timeframe, 15 + days, stats);
            const candles = raw.filter(c => c.time + timeframe <= nowSec); // closed candles only
            // What data was really available: lets you see if a market has less history than asked for.
            out.coverage.push({
                symbol, candles: candles.length, requested: stats.wanted, pages: stats.pages, candlesPerPage: stats.perPage,
                from: candles.length ? core.gmtStamp(candles[0].time) : null, to: candles.length ? core.gmtStamp(candles[candles.length - 1].time + timeframe) : null,
                daysReplayed: Math.max(0, Math.round(((candles.length - window) * timeframe) / 86400)),
            });
            if (candles.length < window + 1) { out.skipped.push({ symbol, reason: `Only ${candles.length} candles available` }); return; }
            const found = bt.runBacktest({
                symbol, symbolName: meta.underlying_symbol_name, market: meta.market, candles, timeframe, strategies, cfg, expirySeconds, window,
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
