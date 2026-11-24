// Smart Money SELL alert for Telegram: sent the moment price touches the entry of a sell setup.
//
// It uses the SAME analysis as the chart (api/_lib/smc.js, generated from src/pages/forex-trader/smc.ts) on the M15 candles,
// asking only for the SELL side. A sell setup that is still forming sends nothing. The message goes out when a 1-minute
// candle reaches the entry (the planned entry once the structure shift is confirmed, otherwise the lower edge of the supply
// zone, the "SELL ENTRY AREA" on the chart). One message per setup (per zone), never repeated. SMC_ALERT=off switches it off.
// Plain functions: no network, no database.
const engine = require('./engine');
const smc = require('./smc');
const { escapeHtml, gmtStamp } = require('./signals-core');

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const TF = 900; // the Smart Money setup is read on the M15 chart
const LIVE_STATES = ['waiting_for_sweep', 'sweep_in_progress', 'ready'];

function readSmcConfig(env = process.env) {
    return {
        enabled: String(env.SMC_ALERT || 'on').toLowerCase() !== 'off',
        multiplier: Math.max(1, num(env.SMC_MULTIPLIER, 100)),
        // a touch older than this many minutes is "too late": nothing is sent
        freshSeconds: Math.round(Math.max(1, num(env.SMC_FRESH_MINUTES, 5)) * 60),
        // closed M15 candles needed before the setup is trusted
        minCandles: Math.max(30, Math.floor(num(env.SMC_MIN_CANDLES, 60))),
    };
}

/** The M15 candle that is still forming, built from the 1-minute candles (so a touch inside the candle is seen live). */
function formingFromMinutes(m1, now) {
    const open = Math.floor(now / TF) * TF;
    const part = m1.filter(c => c.time >= open && c.time < open + TF);
    if (!part.length) return null;
    return {
        time: open,
        open: part[0].open,
        high: Math.max(...part.map(c => c.high)),
        low: Math.min(...part.map(c => c.low)),
        close: part[part.length - 1].close,
    };
}

/**
 * @returns {{stage:'none', note:string} | {stage:'waiting', ...} | {stage:'touched', key, entry, stopLoss, takeProfit, zone, poc, touchTime, state, overlay}}
 */
function findSmcSell(c15, m1, kind, now, cfg) {
    const closed = c15.filter(c => c.time + TF <= now);
    if (closed.length < cfg.minCandles) return { stage: 'none', note: 'Not enough M15 candles yet' };
    const forming = formingFromMinutes(m1, now);
    const a = smc.analyseSmc(closed, kind, forming, now, 'SELL');
    const o = a.smc;
    if (!o || o.side !== 'SELL') return { stage: 'none', note: a.statusText };
    if (!LIVE_STATES.includes(a.state)) return { stage: 'none', note: `Setup is ${a.state}: ${a.statusText}` };
    const ref = o.plan || o.area;
    if (!ref) return { stage: 'none', note: 'No entry level on the chart yet' };
    const { entry, stopLoss, takeProfit } = ref;
    if (![entry, stopLoss, takeProfit].every(Number.isFinite) || !(takeProfit < entry && entry < stopLoss)) return { stage: 'none', note: 'Entry, stop and target are not in a valid sell order' };

    const key = `${o.zone.startTime}`;
    const base = { key, entry, stopLoss, takeProfit, zone: { top: o.zone.top, bottom: o.zone.bottom, label: o.zone.label }, poc: o.partialTp ?? (o.poc ? o.poc.price : null), state: a.state, overlay: o };
    for (const c of m1) {
        if (c.time < ref.fromTime || !Number.isFinite(c.high)) continue;
        if (c.high >= stopLoss) return { stage: 'none', note: 'Price went past the idea\'s invalidation level', ...base };
        if (c.high >= entry) {
            return now - c.time <= cfg.freshSeconds
                ? { stage: 'touched', touchTime: c.time, ...base }
                : { stage: 'none', note: 'Price touched the entry earlier: too late to enter', ...base };
        }
    }
    return { stage: 'waiting', note: `Waiting for price to reach the entry ${engine.px(entry)}`, ...base };
}

/** The Telegram text. No stop-loss line: the trade is a Deriv multiplier whose stake is the stop. Uses Telegram HTML. */
function formatSmcSell(r, symbolName, cfg, { siteUrl, newsNote } = {}) {
    const px = engine.px;
    return [
        `🔴 <b>SELL</b>: ${escapeHtml(symbolName)}`,
        '',
        '⚡ <b>Price has just reached the entry. Enter SELL now.</b>',
        '',
        `📊 Strategy: Smart Money (M15)`,
        `🎯 Entry: <code>${px(r.entry)}</code>`,
        `🧱 Supply zone: <code>${px(r.zone.bottom)} – ${px(r.zone.top)}</code>`,
        ...(r.poc ? [`✅ First take profit (POC): <code>${px(r.poc)}</code>`] : []),
        `🏁 Target (sell side liquidity): <code>${px(r.takeProfit)}</code>`,
        `⚙️ Trade it as a multiplier <b>×${cfg.multiplier}</b>; the stake is your stop.`,
        `🕒 Entry hit: ${gmtStamp(r.touchTime)}`,
        ...(newsNote ? ['', newsNote] : []),
        ...(siteUrl ? ['', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`] : []),
        '',
        '⚠️ Signals only, not financial advice.',
    ].join('\n');
}

module.exports = { readSmcConfig, formingFromMinutes, findSmcSell, formatSmcSell };
