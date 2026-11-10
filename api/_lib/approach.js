// "Price is approaching the Sell SL / Buy SL line" heads-up for Telegram.
//
// The Forex Live chart (strategy "Previous day high/low sweep") draws two lines while it waits for a sweep:
//   Sell SL (if High swept)  above price, and  Buy SL (if Low swept)  below price.
// The Sniper bot trades when price touches one of them. This file sends a Telegram message BEFORE that happens, with a chart
// picture, so the owner can log in and switch the Sniper on. It never trades and never switches anything on.
//
// It uses the SAME analysis as the chart (api/_lib/engine.js, strategy 2), so the lines are the ones on the screen.
// The alert is sent once per side per UTC day per market. APPROACH_ALERT=off switches it off.
// APPROACH_ATR (default 4) = how close counts as "approaching", in candles' worth of movement (ATR of the 5-minute candles).
const engine = require('./engine');
const { escapeHtml } = require('./signals-core');

const PREVIOUS_DAY_STRATEGY = 2;

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

function readApproachConfig(env = process.env) {
    return {
        enabled: String(env.APPROACH_ALERT || 'on').toLowerCase() !== 'off',
        atrFraction: Math.max(0.1, num(env.APPROACH_ATR, 4)),
    };
}

/**
 * Looks at the 5-minute candles and answers which of the two SL lines price is near (or has reached).
 * Returns { analysis, atr, price, lines: [{ side: 'SELL' | 'BUY', level, distance, near }] } or null when the chart has no such lines.
 * `distance` is how far price still has to go (negative = already beyond the line).
 */
function findApproach(c5, kind, now, cfg, tf = 300) {
    const closed = c5.filter(c => c.time + tf <= now);
    const forming = c5.find(c => c.time + tf > now) || null;
    if (closed.length < 30) return null;
    const a = engine.analyse(PREVIOUS_DAY_STRATEGY, closed, kind, forming, now);
    if (!a || !a.watch) return null;
    const atr = engine.atr(closed, 14);
    if (!Number.isFinite(atr) || atr <= 0) return null;
    const last = closed[closed.length - 1];
    const price = forming ? forming.close : last.close;
    const top = forming ? Math.max(price, forming.high) : price; // the highest price seen in the forming candle
    const bottom = forming ? Math.min(price, forming.low) : price;
    const lines = [
        { side: 'SELL', level: a.watch.sell.stopLoss, distance: a.watch.sell.stopLoss - top, plan: a.watch.sell },
        { side: 'BUY', level: a.watch.buy.stopLoss, distance: bottom - a.watch.buy.stopLoss, plan: a.watch.buy },
    ].map(l => ({ ...l, near: Number.isFinite(l.level) && l.distance <= atr * cfg.atrFraction }));
    return { analysis: a, closed, atr, price, lines };
}

const dayKey = now => new Date(now * 1000).toISOString().slice(0, 10);

/** The Telegram text. */
function formatApproach(found, line, symbolName, { siteUrl } = {}) {
    const sell = line.side === 'SELL';
    const px = engine.px;
    const gap = Math.abs(line.distance);
    const reached = line.distance <= 0;
    const range = found.analysis.range;
    return [
        `⚠️ <b>${reached ? 'REACHED' : 'APPROACHING'} THE ${sell ? 'SELL' : 'BUY'} SL LINE</b>: ${escapeHtml(symbolName)}`,
        '',
        reached
            ? `Price ${px(found.price)} has reached the ${sell ? 'Sell' : 'Buy'} SL line at <b>${px(line.level)}</b> (${sell ? 'if the High is swept' : 'if the Low is swept'}).`
            : `Price ${px(found.price)} is ${px(gap)} away from the ${sell ? 'Sell' : 'Buy'} SL line at <b>${px(line.level)}</b> (${sell ? 'if the High is swept' : 'if the Low is swept'}).`,
        ...(range ? [`📏 ${escapeHtml(range.label)}: High ${px(range.high)} · Low ${px(range.low)}`] : []),
        '',
        '👉 Log in to the site and switch the Sniper on now if you want it to trade this line.',
        'ℹ️ Heads-up only: nothing has been traded and nothing was switched on.',
        ...(siteUrl ? ['', `🔗 <a href="${escapeHtml(siteUrl)}">Open the site</a>`] : []),
        '',
        '⚠️ Not financial advice.',
    ].join('\n');
}

/**
 * The whole job for one market, used by the 5-minute watcher. Sends each near line once per day.
 * deps: { sql, write, send, deliver, store, siteUrl }.  Returns a small report for the run's JSON.
 */
async function runApproach({ symbol, symbolName, kind, c5, now, cfg, deps }) {
    const report = {};
    const found = findApproach(c5, kind, now, cfg);
    if (!found) { report.status = 'no SL lines on the chart right now'; return report; }
    report.price = found.price;
    report.lines = found.lines.map(l => ({ side: l.side, level: l.level, distance: Number(l.distance.toFixed(5)), near: l.near }));
    for (const line of found.lines.filter(l => l.near)) {
        const text = formatApproach(found, line, symbolName, { siteUrl: deps.siteUrl });
        const key = `${symbol}|approach|${line.side}|${dayKey(now)}`;
        if (!deps.write) { (report.wouldSend = report.wouldSend || []).push(text); continue; }
        if (!(await deps.store.claimAlert(deps.sql, key))) { (report.skipped = report.skipped || []).push(`${line.side}: already sent today`); continue; }
        try {
            const sig = { ...line.plan, symbol, symbolName, timeframe: 300, time: found.closed[found.closed.length - 1].time };
            await deps.send(() => deps.deliver(text, { candles: found.closed, analysis: found.analysis, signal: sig }));
            (report.sent = report.sent || []).push(line.side);
        } catch (err) {
            await deps.store.releaseAlert(deps.sql, key); // Telegram refused: the next run tries again
            (report.sent = report.sent || []).push(`${line.side} failed: ${err.message}`);
            console.error('approach: alert failed:', err.message);
        }
    }
    return report;
}

module.exports = { readApproachConfig, findApproach, formatApproach, runApproach, dayKey, PREVIOUS_DAY_STRATEGY };
