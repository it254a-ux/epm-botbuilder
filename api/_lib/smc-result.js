// Result message for Smart Money alerts: when a trade from an alert reaches its take profit (tpMultiple x the stake,
// for example 0.5 x $10 = $5), one "TAKE PROFIT HIT" message is sent, once. There is no stop loss; if price first moves
// against the entry by a whole stake (1 / multiplier) the Deriv trade would have been closed, so that trade is closed
// quietly and nothing is sent. A trade that reaches neither within SMC_RESULT_HOURS (default 48) is closed quietly too.
const { escapeHtml, gmtStamp } = require('./signals-core');
const { parseStakes } = require('./signal-outcome');

let ready = false;
async function ensureTable(sql) {
    if (ready) return;
    await sql`CREATE TABLE IF NOT EXISTS smc_trades (
        key         TEXT PRIMARY KEY,
        symbol      TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        side        TEXT NOT NULL,
        tf          INTEGER NOT NULL,
        entry       DOUBLE PRECISION NOT NULL,
        take_profit DOUBLE PRECISION NOT NULL,
        multiplier  DOUBLE PRECISION NOT NULL,
        tp_multiple DOUBLE PRECISION NOT NULL,
        entry_time  BIGINT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        hit_time    BIGINT,
        result_sent BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    ready = true;
}

/** Remember a trade whose alert was just sent. */
async function recordTrade(sql, t) {
    await ensureTable(sql);
    await sql`INSERT INTO smc_trades (key, symbol, symbol_name, side, tf, entry, take_profit, multiplier, tp_multiple, entry_time)
              VALUES (${t.key}, ${t.symbol}, ${t.symbolName}, ${t.side}, ${t.tf}, ${t.entry}, ${t.takeProfit}, ${t.multiplier}, ${t.tpMultiple}, ${t.entryTime})
              ON CONFLICT (key) DO NOTHING`;
}

/** Looks at the 1-minute candles after the entry. Returns { status: 'hit_tp'|'stopped'|'expired', time } or null (still open). */
function evaluateTrade(t, m1, now, expirySeconds) {
    const buy = t.side === 'BUY';
    const stopMove = 1 / t.multiplier;
    const stopPrice = buy ? t.entry * (1 - stopMove) : t.entry * (1 + stopMove);
    for (const c of m1) {
        if (c.time <= t.entryTime) continue; // counted from the candle after the entry candle
        const hitTp = buy ? c.high >= t.takeProfit : c.low <= t.takeProfit;
        const hitStop = buy ? c.low <= stopPrice : c.high >= stopPrice;
        if (hitStop) return { status: 'stopped', time: c.time }; // both in one candle counts as the stop (the safe way)
        if (hitTp) return { status: 'hit_tp', time: c.time };
    }
    if (now - t.entryTime > expirySeconds) return { status: 'expired', time: now };
    return null;
}

const money = n => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function formatTpHit(t, hitTime, { stakes, siteUrl } = {}) {
    const sell = t.side !== 'BUY';
    const lines = [
        `✅ <b>TAKE PROFIT HIT</b>: ${escapeHtml(t.symbolName)} ${sell ? 'SELL' : 'BUY'}`,
        '',
        `📊 Smart Money · ${t.tf === 300 ? 'M5' : t.tf === 900 ? 'M15' : `${t.tf}s`}`,
        `🎯 Entry <code>${t.entry}</code> · ✅ Take profit <b>${t.tpMultiple}× stake</b> (${Math.round(t.tpMultiple * 100)}% profit) at <code>${t.takeProfit}</code>`,
        '',
        '💰 Result (multiplier ×' + t.multiplier + '):',
    ];
    for (const s of stakes || [10]) lines.push(`   ${money(s)} stake → <b>+${money(Math.round(s * t.tpMultiple * 100) / 100)}</b>`);
    lines.push('', `🕒 Entry: ${gmtStamp(t.entryTime)}`, `🕒 Take profit hit: ${gmtStamp(hitTime)}`);
    if (siteUrl) lines.push('', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`);
    lines.push('', '⚠️ Signals only, not financial advice.');
    return lines.join('\n');
}

/**
 * Checks every open trade and sends one message for each take profit reached. Plain callbacks, so it can be tested:
 *   getM1(symbol, sinceTime) -> 1-minute candles from about sinceTime until now
 *   send(text)     -> sends the Telegram text (throws if refused; the message is then retried on the next run)
 */
async function checkTrades(sql, { getM1, send, now, stakes, siteUrl, expirySeconds }) {
    await ensureTable(sql);
    const report = { checked: 0, sent: 0, closedQuietly: 0 };
    // a take profit that was reached but whose message Telegram refused: send it again
    const toResend = await sql`SELECT * FROM smc_trades WHERE status = 'hit_tp' AND result_sent = false LIMIT 20`;
    const open = await sql`SELECT * FROM smc_trades WHERE status = 'open' ORDER BY created_at ASC LIMIT 60`;
    const map = r => ({ key: r.key, symbol: r.symbol, symbolName: r.symbol_name, side: r.side, tf: Number(r.tf), entry: Number(r.entry), takeProfit: Number(r.take_profit), multiplier: Number(r.multiplier), tpMultiple: Number(r.tp_multiple), entryTime: Number(r.entry_time), hitTime: r.hit_time == null ? null : Number(r.hit_time) });
    for (const row of toResend) {
        const t = map(row);
        try {
            await send(formatTpHit(t, t.hitTime, { stakes, siteUrl }));
            await sql`UPDATE smc_trades SET result_sent = true WHERE key = ${t.key}`;
            report.sent++;
        } catch (err) {
            console.error('smc-result: resend failed:', err.message);
        }
    }
    const cache = new Map();
    const oldest = new Map(); // the oldest open entry of each market: only that much history is downloaded
    for (const row of open) oldest.set(row.symbol, Math.min(Number(row.entry_time), oldest.get(row.symbol) ?? Infinity));
    for (const row of open) {
        const t = map(row);
        report.checked++;
        try {
            if (!cache.has(t.symbol)) cache.set(t.symbol, await getM1(t.symbol, oldest.get(t.symbol)));
            const out = evaluateTrade(t, cache.get(t.symbol), now, expirySeconds);
            if (!out) continue;
            // only the run that changes the row from 'open' goes on (two runs at once never send twice)
            const won = await sql`UPDATE smc_trades SET status = ${out.status}, hit_time = ${out.time} WHERE key = ${t.key} AND status = 'open' RETURNING key`;
            if (!won.length) continue;
            if (out.status !== 'hit_tp') {
                report.closedQuietly++;
                continue;
            }
            try {
                await send(formatTpHit(t, out.time, { stakes, siteUrl }));
                await sql`UPDATE smc_trades SET result_sent = true WHERE key = ${t.key}`;
                report.sent++;
            } catch (err) {
                console.error('smc-result: Telegram failed (retried next run):', err.message);
            }
        } catch (err) {
            console.error(`smc-result: could not check ${t.symbol}:`, err.message);
        }
    }
    return report;
}

function readResultConfig(env = process.env) {
    const hours = Number(env.SMC_RESULT_HOURS || 48);
    return { stakes: parseStakes(env.RESULT_STAKES), expirySeconds: Math.round((Number.isFinite(hours) && hours > 0 ? hours : 48) * 3600) };
}

module.exports = { recordTrade, evaluateTrade, formatTpHit, checkTrades, readResultConfig };
