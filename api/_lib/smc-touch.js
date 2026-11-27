// Smart Money alert for Telegram (BUY and SELL): sent the moment price touches the entry of a setup that goes with WHO IS IN CONTROL.
//
// It uses the SAME analysis as the chart (api/_lib/smc.js, generated from src/pages/forex-trader/smc.ts) on the M15 candles,
// following who is in control (buyers = BUY setups, sellers = SELL setups; no proven side = nothing is sent).
// A setup that is still forming sends nothing. The message goes out when a 1-minute
// candle reaches the entry (the planned entry once the structure shift is confirmed, otherwise the lower edge of the supply
// zone, the "SELL ENTRY AREA" on the chart). One message per setup (per zone), never repeated. SMC_ALERT=off switches it off.
// Plain functions: no network, no database.
const engine = require('./engine');
const smc = require('./smc');
const { escapeHtml, gmtStamp } = require('./signals-core');

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const TF = 900; // default: the Smart Money setup is read on the M15 chart (the M5 chart is read too, see routes/signal-watch-mtf.js)
const tfName = tf => (tf === 300 ? 'M5' : tf === 900 ? 'M15' : `${tf}s`);
const LIVE_STATES = ['waiting_for_sweep', 'sweep_in_progress', 'ready'];

function readSmcConfig(env = process.env) {
    return {
        enabled: String(env.SMC_ALERT || 'on').toLowerCase() !== 'off',
        multiplier: Math.max(1, num(env.SMC_MULTIPLIER, 100)),
        // take profit = this many times the stake (no stop loss: the stake is the most that can be lost)
        tpMultiple: Math.max(0.05, num(env.SMC_TP_STAKES, 0.2)),
        // a touch older than this many minutes is "too late": nothing is sent
        freshSeconds: Math.round(Math.max(1, num(env.SMC_FRESH_MINUTES, 5)) * 60),
        // closed M15 candles needed before the setup is trusted
        minCandles: Math.max(30, Math.floor(num(env.SMC_MIN_CANDLES, 60))),
        // BUY alerts too (SMC_BUY=off keeps sells only); an alert goes out only when the setup goes with who is in control
        buys: String(env.SMC_BUY || 'on').toLowerCase() !== 'off',
        followControl: String(env.SMC_FOLLOW_CONTROL || 'on').toLowerCase() !== 'off',
        // optional trading hours: e.g. SMC_SESSIONS=london,overlap,newyork (empty = every hour). Names: asian, london, overlap, newyork
        sessions: String(env.SMC_SESSIONS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
    };
}

/** The M15 candle that is still forming, built from the 1-minute candles (so a touch inside the candle is seen live). */
function formingFromMinutes(m1, now, tf = TF) {
    const open = Math.floor(now / tf) * tf;
    const part = m1.filter(c => c.time >= open && c.time < open + tf);
    if (!part.length) return null;
    return {
        time: open,
        open: part[0].open,
        high: Math.max(...part.map(c => c.high)),
        low: Math.min(...part.map(c => c.low)),
        close: part[part.length - 1].close,
    };
}

/** Session name of an epoch time, as a short key for SMC_SESSIONS. */
function sessionKey(t) {
    const h = new Date(t * 1000).getUTCHours();
    return h < 7 ? 'asian' : h < 12 ? 'london' : h < 16 ? 'overlap' : h < 21 ? 'newyork' : 'late';
}

/**
 * Looks for a setup on the closed candles that goes WITH who is in control, and says whether price has just touched its entry.
 * @returns {{stage:'none', note:string} | {stage:'waiting', ...} | {stage:'touched', side, key, entry, stopLoss, takeProfit, zone, poc, touchTime, state, control, overlay}}
 */
function findSmcEntry(c15, m1, kind, now, cfg, tf = TF) {
    const closed = c15.filter(c => c.time + tf <= now);
    if (closed.length < cfg.minCandles) return { stage: 'none', note: `Not enough ${tfName(tf)} candles yet` };
    const forming = formingFromMinutes(m1, now, tf);
    // asking for no side in particular: the strategy follows who is in control (smc.ts); SMC_FOLLOW_CONTROL=off keeps the old sell-only reading
    const a = smc.analyseSmc(closed, kind, forming, now, cfg.followControl === false ? 'SELL' : null);
    const o = a.smc;
    const control = a.control || (o && o.control) || null;
    if (!o) return { stage: 'none', note: a.statusText };
    if (cfg.followControl !== false) {
        if (!control || control.who === 'MIXED') return { stage: 'none', note: 'No side has proven control of the market yet: no alert' };
        const wants = control.who === 'BUYERS' ? 'BUY' : 'SELL';
        if (o.side !== wants) return { stage: 'none', note: `${control.who === 'BUYERS' ? 'Buyers' : 'Sellers'} are in control: a ${o.side} setup is not sent` };
    }
    if (o.side === 'BUY' && !cfg.buys) return { stage: 'none', note: 'BUY alerts are switched off (SMC_BUY=off)' };
    if (!LIVE_STATES.includes(a.state)) return { stage: 'none', note: `Setup is ${a.state}: ${a.statusText}` };
    const ref = o.plan || o.area;
    if (!ref) return { stage: 'none', note: 'No entry level on the chart yet' };
    const { entry, stopLoss, takeProfit } = ref;
    const sell = o.side === 'SELL';
    const ordered = sell ? takeProfit < entry && entry < stopLoss : stopLoss < entry && entry < takeProfit;
    if (![entry, stopLoss, takeProfit].every(Number.isFinite) || !ordered) return { stage: 'none', note: `Entry, stop and target are not in a valid ${o.side} order` };

    const key = tf === TF ? `${o.zone.startTime}` : `${tf}:${o.zone.startTime}`;
    const base = { side: o.side, key, tf, entry, stopLoss, takeProfit, zone: { top: o.zone.top, bottom: o.zone.bottom, label: o.zone.label }, poc: o.partialTp ?? (o.poc ? o.poc.price : null), state: a.state, control, overlay: o };
    for (const c of m1) {
        if (c.time < ref.fromTime || !Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;
        if (sell ? c.high >= stopLoss : c.low <= stopLoss) return { stage: 'none', note: 'Price went past the idea\'s invalidation level', ...base };
        if (sell ? c.high >= entry : c.low <= entry) {
            return now - c.time <= cfg.freshSeconds
                ? { stage: 'touched', touchTime: c.time, ...base }
                : { stage: 'none', note: 'Price touched the entry earlier: too late to enter', ...base };
        }
    }
    return { stage: 'waiting', note: `Waiting for price to reach the ${o.side} entry ${engine.px(entry)}`, ...base };
}

/** The old name: kept so existing callers keep working. */
const findSmcSell = findSmcEntry;

/** The price a multiplier trade opened at the entry has to reach to make `tpMultiple` times the stake. */
function stakeTpPrice(entry, cfg, side = 'SELL') {
    const move = cfg.tpMultiple / cfg.multiplier;
    return side === 'BUY' ? entry * (1 + move) : entry * (1 - move);
}

/** The Telegram text. No stop-loss line: the trade is a Deriv multiplier whose stake is the stop. Uses Telegram HTML. */
function formatSmcEntry(r, symbolName, cfg, { siteUrl, newsNote, htf } = {}) {
    const px = engine.px;
    const sell = r.side !== 'BUY';
    const side = sell ? 'SELL' : 'BUY';
    const who = r.control ? (r.control.who === 'BUYERS' ? 'Buyers' : r.control.who === 'SELLERS' ? 'Sellers' : null) : null;
    const lines = [
        `${sell ? '🔴' : '🟢'} <b>${side}</b>: ${escapeHtml(symbolName)}`,
        '',
        `⚡ <b>Price has just reached the entry. Enter ${side} now.</b>`,
        '',
        `📊 Strategy: Smart Money (${tfName(r.tf || TF)})`,
        `🎯 Entry: <code>${px(r.entry)}</code>`,
        `🧱 ${sell ? 'Supply' : 'Demand'} zone: <code>${px(r.zone.bottom)} – ${px(r.zone.top)}</code>`,
        `✅ Take profit: <b>${cfg.tpMultiple}× your stake</b> (${Math.round(cfg.tpMultiple * 100)}% profit), price about <code>${px(stakeTpPrice(r.entry, cfg, side))}</code>`,
        `⚙️ Trade it as a multiplier <b>×${cfg.multiplier}</b>. No stop loss: the stake is the most you can lose.`,
    ];
    if (who) lines.push(`🧭 ${who} are in control${r.control.weakening ? ` · ⚠️ ${escapeHtml(r.control.weakening)}` : ''}`);
    if (htf) lines.push(`🕐 1h chart: ${htf.text}`);
    lines.push(`🌍 Session: ${engine.sessionAt(r.touchTime)}`);
    lines.push(`🕒 Entry hit: ${gmtStamp(r.touchTime)}`);
    if (newsNote) lines.push('', newsNote);
    if (siteUrl) lines.push('', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`);
    lines.push('', '⚠️ Signals only, not financial advice.');
    return lines.join('\n');
}
const formatSmcSell = formatSmcEntry;

/** What the 1h chart says about a trade (information only): { text, agrees } or null when the 1h control is unknown. */
function htfNote(control, side) {
    if (!control || control.who === 'MIXED') return null;
    const buyers = control.who === 'BUYERS';
    const agrees = (side === 'BUY') === buyers;
    return { agrees, text: `${buyers ? 'Buyers' : 'Sellers'} in control — ${agrees ? 'with this trade ✓' : 'against this trade ✗'}` };
}

module.exports = { stakeTpPrice, tfName, sessionKey, htfNote, readSmcConfig, formingFromMinutes, findSmcEntry, findSmcSell, formatSmcEntry, formatSmcSell };
