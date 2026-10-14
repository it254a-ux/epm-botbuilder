// Signal machine, server side. Called on a schedule (every 15 minutes) by a cron service.
//
// For every market in WATCH_SYMBOLS: skip it if closed/suspended, load candles from Deriv,
// and, only if a NEW candle has closed since the last check, run the SAME analysis the chart
// uses (api/_lib/engine.js is generated from src/pages/forex-trader/engine.ts). Every READY
// setup that is fresh and meets the minimum RR is saved once (duplicates are blocked by the
// database) and sent to Telegram. The website feed (/api/signals) reads the same table.
//
// Protected by SIGNALS_SECRET. Call it with the header   Authorization: Bearer <SIGNALS_SECRET>
// or (easier to set up) with   ?key=<SIGNALS_SECRET>
//
// Extra switches for testing:
//   ?test=1   sends a test message to Telegram and does nothing else
//   ?dry=1    analyses and reports what it WOULD send; sends and saves nothing
//   ?force=1  re-analyses even if no new candle has closed (duplicates are still blocked)
const crypto = require('crypto');
const { getDb } = require('./_lib/db');
const deriv = require('./_lib/deriv');
const { sendTelegram } = require('./_lib/telegram');
const engine = require('./_lib/engine');
const core = require('./_lib/signals-core');
const store = require('./_lib/signals-store');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function authorised(req) {
    const secret = process.env.SIGNALS_SECRET;
    if (!secret) return false; // never open by accident
    const header = String(req.headers.authorization || '');
    const given = header.startsWith('Bearer ') ? header.slice(7) : String((req.query && req.query.key) || '');
    const a = Buffer.from(given);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
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

    const cfg = core.readConfig();
    const report = { ok: true, dry, timeframe: cfg.timeframe, minRr: cfg.minRr, markets: [] };

    let client;
    try {
        client = await deriv.connect();
    } catch (err) {
        console.error('signal-watch: Deriv connection failed:', err.message);
        res.status(502).json({ ok: false, error: err.message });
        return;
    }

    try {
        const sql = dry ? null : getDb();
        if (sql) {
            await store.ensureTables(sql);
            // Retry anything saved earlier that Telegram did not accept.
            for (const s of await store.getUnsent(sql)) {
                try {
                    const sent = await sendTelegram(core.formatTelegram(s));
                    await store.markTelegramSent(sql, s.id, sent.messageId);
                } catch (err) {
                    console.error('signal-watch: Telegram retry failed:', err.message);
                }
            }
        }

        const active = await deriv.getActiveSymbols(client);
        const bySymbol = new Map(active.map(s => [s.underlying_symbol, s]));

        for (const symbol of cfg.symbols) {
            const entry = { symbol, results: [] };
            report.markets.push(entry);
            try {
                const info = bySymbol.get(symbol);
                if (!info) { entry.skipped = 'Not in the Deriv market list'; continue; }
                if (info.exchange_is_open === 0 || info.is_trading_suspended === 1) {
                    entry.skipped = 'Market closed or suspended';
                    continue;
                }

                const candles = await deriv.getCandles(client, symbol, cfg.timeframe);
                const now = Math.floor(Date.now() / 1000);
                const closed = candles.filter(c => c.time + cfg.timeframe <= now);
                const forming = candles.find(c => c.time + cfg.timeframe > now) || null;
                if (!closed.length) { entry.skipped = 'No closed candles yet'; continue; }
                const lastClosed = closed[closed.length - 1].time;
                entry.lastClosedCandle = core.gmtStamp(lastClosed);

                if (sql && !force) {
                    const seen = await store.getLastCandle(sql, symbol, cfg.timeframe);
                    if (seen === lastClosed) { entry.skipped = 'No new closed candle since the last check'; continue; }
                }

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
                    if (a.plan.rr < cfg.minRr) { r.skipped = `RR ${a.plan.rr.toFixed(2)} below minimum ${cfg.minRr}`; continue; }

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
                    };
                    if (dry) { r.wouldSend = core.formatTelegram(sig); continue; }

                    const id = await store.insertSignal(sql, sig);
                    if (id === null) { r.skipped = 'Already sent before (duplicate)'; continue; }
                    r.saved = true;
                    try {
                        const sent = await sendTelegram(core.formatTelegram(sig));
                        await store.markTelegramSent(sql, id, sent.messageId);
                        r.telegram = 'sent';
                    } catch (err) {
                        // Saved on the website feed; Telegram is retried on the next run.
                        r.telegram = `failed: ${err.message}`;
                        console.error('signal-watch: Telegram failed:', err.message);
                    }
                }
                if (sql) await store.setLastCandle(sql, symbol, cfg.timeframe, lastClosed);
            } catch (err) {
                entry.error = err.message;
                report.ok = false;
                console.error(`signal-watch: ${symbol} failed:`, err.message);
            }
            await sleep(250); // be gentle with Deriv between markets
        }
    } catch (err) {
        report.ok = false;
        report.error = err.message;
        console.error('signal-watch: run failed:', err.message);
    } finally {
        client.close();
    }

    res.status(report.ok ? 200 : 500).json(report);
};
