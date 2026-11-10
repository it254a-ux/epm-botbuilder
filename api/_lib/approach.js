// "Price is approaching the Sell SL / Buy SL line" heads-up for Telegram.
//
// The Forex Live chart (strategy "Previous day high/low sweep") draws two lines while it waits for a sweep:
//   Sell SL (if High swept)  above price, and  Buy SL (if Low swept)  below price.
// The Sniper bot trades when price touches one of them. The SL lines sit just beyond the Previous Day High / Low, so the moment
// price TOUCHES the Previous Day High (or Low) it is about to reach the SL line. That touch is when this file sends a Telegram
// message, with a chart picture, so the owner can log in and switch the Sniper on. It never trades and never switches anything on.
//
// It uses the SAME analysis as the chart (api/_lib/engine.js, strategy 2), so the lines are the ones on the screen.
// The alert is sent once per side per UTC day per market. APPROACH_ALERT=off switches it off.
// APPROACH_ATR (default 0) = warn this much EARLIER, in candles' worth of movement (ATR of the 5-minute candles) before price
// reaches the Previous Day High / Low. 0 = exactly when it touches the line.
const engine = require('./engine');
const { escapeHtml } = require('./signals-core');

const PREVIOUS_DAY_STRATEGY = 2;

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

function readApproachConfig(env = process.env) {
    return {
        enabled: String(env.APPROACH_ALERT || 'on').toLowerCase() !== 'off',
        atrFraction: Math.max(0, num(env.APPROACH_ATR, 0)),
    };
}

/** The SL line and plan the chart would draw for one side (same rule as the chart's "watch" lines in engine.js). */
function rulePlan(side, range, atr, extreme) {
    const sell = side === 'SELL';
    const pad = atr * 0.25;
    const entry = sell ? range.high : range.low;
    const stopLoss = sell ? (extreme ?? range.high + atr) + pad : (extreme ?? range.low - atr) - pad;
    const takeProfit = sell ? range.low : range.high;
    const risk = Math.abs(stopLoss - entry);
    return { side, trigger: entry, entry, stopLoss, takeProfit, rr: risk > 0 ? Math.abs(entry - takeProfit) / risk : 0 };
}

/** The candles that count as "just now": the forming one and the last few closed ones, so a touch is never missed between two runs. */
const RECENT_CANDLES = 3;

/**
 * Looks at the 5-minute candles and answers which side price has just touched the Previous Day High / Low line of.
 * Returns { analysis, atr, price, lines: [{ side: 'SELL' | 'BUY', edge, level, distance, near }] } or null when the chart has no such lines.
 * `edge` = the Previous Day High (SELL) or Low (BUY); `level` = the SL line just beyond it; `distance` = how far price still is from the SL line.
 */
function findApproach(c5, kind, now, cfg, tf = 300) {
    const closed = c5.filter(c => c.time + tf <= now);
    const forming = c5.find(c => c.time + tf > now) || null;
    if (closed.length < 30) return null;
    const a = engine.analyse(PREVIOUS_DAY_STRATEGY, closed, kind, forming, now);
    if (!a || !a.range) return null;
    const atr = engine.atr(closed, 14);
    if (!Number.isFinite(atr) || atr <= 0) return null;
    const last = closed[closed.length - 1];
    const price = forming ? forming.close : last.close;
    const recent = closed.slice(-RECENT_CANDLES).concat(forming ? [forming] : []);
    const top = Math.max(price, ...recent.map(c => c.high)); // the highest price seen just now
    const bottom = Math.min(price, ...recent.map(c => c.low));
    const early = atr * cfg.atrFraction;
    // While nothing has swept, the chart draws both SL lines (a.watch). Once a candle has closed beyond the line the chart's analysis
    // moves on to a sweep setup and stops drawing them, so the same rule is applied here: edge +/- 1 x ATR, plus a quarter ATR of room.
    const w = a.watch || {
        sell: rulePlan('SELL', a.range, atr, top > a.range.high ? top : undefined),
        buy: rulePlan('BUY', a.range, atr, bottom < a.range.low ? bottom : undefined),
    };
    const lines = [
        { side: 'SELL', edge: w.sell.entry, level: w.sell.stopLoss, distance: w.sell.stopLoss - top, touched: top >= w.sell.entry - early, plan: w.sell },
        { side: 'BUY', edge: w.buy.entry, level: w.buy.stopLoss, distance: bottom - w.buy.stopLoss, touched: bottom <= w.buy.entry + early, plan: w.buy },
    ].map(({ touched, ...l }) => ({ ...l, near: touched && Number.isFinite(l.level) }));
    return { analysis: a, closed, atr, price, lines };
}

const dayKey = now => new Date(now * 1000).toISOString().slice(0, 10);

/** The Telegram text. */
function formatApproach(found, line, symbolName, { siteUrl } = {}) {
    const sell = line.side === 'SELL';
    const px = engine.px;
    const range = found.analysis.range;
    const edgeName = `${range ? `${range.label} ` : ''}${sell ? 'High' : 'Low'}`;
    const reached = line.distance <= 0;
    return [
        `⚠️ <b>${escapeHtml(symbolName)} touched the ${escapeHtml(edgeName)}</b>`,
        '',
        reached
            ? `Price ${px(found.price)} has reached the <b>${sell ? 'Sell' : 'Buy'} SL line at ${px(line.level)}</b> (${sell ? 'if the High is swept' : 'if the Low is swept'}).`
            : `Price ${px(found.price)} touched the ${escapeHtml(edgeName)} at ${px(line.edge)}. It is about to reach the <b>${sell ? 'Sell' : 'Buy'} SL line at ${px(line.level)}</b> (${sell ? 'if the High is swept' : 'if the Low is swept'}), ${px(Math.abs(line.distance))} away.`,
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
