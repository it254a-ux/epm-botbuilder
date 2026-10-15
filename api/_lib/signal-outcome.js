// What happened to a signal after it was sent: pure functions (no network, no database).
//
// RULES (agreed with the owner, kept deliberately cautious so results are never flattered):
//  1. The signal exists from the moment its candle closed. Only candles AFTER that count.
//  2. A trade is "entered" when a later candle trades through the entry price.
//  3. If price reaches the take profit or the stop loss BEFORE the entry was ever touched,
//     nobody could have entered: "not_triggered".
//  4. In the candle that enters the trade, only the stop loss is checked (we cannot know whether
//     the target came before or after the entry inside one candle). Take profit counts from the next candle.
//  5. If one candle touches BOTH the stop loss and the take profit, it is a LOSS.
//  6. After RESULT_EXPIRY_HOURS (default 24) without a result: "expired" if the trade was entered,
//     "not_triggered" if it never was.
//  7. Money: the stake is the amount RISKED. A win pays stake x reward:risk, a loss costs the stake.
//     (This needs no lot size, so it is exact.)
const { px } = require('./engine');
const { escapeHtml, gmtStamp, timeframeLabel } = require('./signals-core');

/**
 * @returns {null | {status:'hit_tp'|'hit_sl'|'not_triggered'|'expired', enteredTime:number|null, closedTime:number}}
 *          null = still open, nothing to report yet.
 */
function evaluateSignal(sig, candles, now, expirySeconds) {
    const buy = sig.side === 'BUY';
    const tf = sig.timeframe;
    const startAfter = sig.time + tf; // open time of the first candle after the signal candle closed
    let entered = null;

    for (const c of candles) {
        if (c.time < startAfter) continue;
        if (c.time + tf > now) break; // still forming: only closed candles count
        const touchesEntry = c.low <= sig.entry && c.high >= sig.entry;
        const hitSl = buy ? c.low <= sig.stopLoss : c.high >= sig.stopLoss;
        const hitTp = buy ? c.high >= sig.takeProfit : c.low <= sig.takeProfit;

        if (entered === null) {
            if (touchesEntry) {
                entered = c.time;
                if (hitSl) return { status: 'hit_sl', enteredTime: entered, closedTime: c.time };
                continue; // take profit is only counted from the next candle
            }
            if (hitSl || hitTp) return { status: 'not_triggered', enteredTime: null, closedTime: c.time };
        } else {
            if (hitSl) return { status: 'hit_sl', enteredTime: entered, closedTime: c.time }; // also when both were touched
            if (hitTp) return { status: 'hit_tp', enteredTime: entered, closedTime: c.time };
        }
    }

    if (now >= startAfter + expirySeconds) {
        return { status: entered === null ? 'not_triggered' : 'expired', enteredTime: entered, closedTime: Math.floor(now) };
    }
    return null;
}

const round2 = n => Math.round(n * 100) / 100;
const money = n => {
    const abs = Math.abs(round2(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '-' : '+'}$${abs}`;
};
const stakeLabel = n => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** Profit (+) or loss (-) for a given risked amount. */
function resultFor(status, rr, stake) {
    if (status === 'hit_tp') return round2(stake * rr);
    if (status === 'hit_sl') return -round2(stake);
    return 0;
}

/** The Telegram text for one finished signal (Telegram HTML). */
function formatResult(sig, outcome, { stakes = [10, 20, 50], siteUrl } = {}) {
    const tf = timeframeLabel(sig.timeframe);
    const name = escapeHtml(sig.symbolName || sig.symbol);
    const head = {
        hit_tp: `✅ <b>TAKE PROFIT HIT</b>: ${name} ${sig.side}`,
        hit_sl: `❌ <b>STOP LOSS HIT</b>: ${name} ${sig.side}`,
        not_triggered: `⚪ <b>ENTRY NOT REACHED</b>: ${name} ${sig.side}`,
        expired: `⏳ <b>EXPIRED, NO RESULT</b>: ${name} ${sig.side}`,
    }[outcome.status];

    const lines = [head, '', `📊 ${escapeHtml(sig.strategyName)} · ${tf}`, `🎯 Entry <code>${px(sig.entry)}</code> · 🛑 SL <code>${px(sig.stopLoss)}</code> · ✅ TP <code>${px(sig.takeProfit)}</code>`, `⚖️ Risk : Reward = 1 : ${Number(sig.rr).toFixed(2)}`];

    if (outcome.status === 'hit_tp' || outcome.status === 'hit_sl') {
        lines.push('', '💵 If you risked:');
        for (const s of stakes) {
            const v = resultFor(outcome.status, sig.rr, s);
            lines.push(`   ${stakeLabel(s)} → <b>${money(v)}</b>`);
        }
        lines.push('', `🕒 Entered: ${gmtStamp(outcome.enteredTime)} candle`, `🕒 ${outcome.status === 'hit_tp' ? 'Target' : 'Stop'} hit: ${gmtStamp(outcome.closedTime)} candle`);
    } else if (outcome.status === 'not_triggered') {
        lines.push('', 'Price never came back to the entry before the setup ended (or the time ran out), so there was no trade. No profit, no loss.');
    } else {
        lines.push('', `The trade was entered (${gmtStamp(outcome.enteredTime)} candle) but neither the stop loss nor the take profit was reached in time. No result is counted.`);
    }
    if (siteUrl) lines.push('', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`);
    lines.push('', '⚠️ Past results do not guarantee future results. Signals only, not financial advice.');
    return lines.join('\n');
}

/** RESULT_STAKES="10,20,50" -> [10,20,50] (positive numbers, at most 5). */
function parseStakes(v) {
    const list = String(v || '10,20,50').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
    return (list.length ? list : [10, 20, 50]).slice(0, 5);
}

function readResultConfig(env = process.env) {
    const hours = Number(env.RESULT_EXPIRY_HOURS || 24);
    return {
        stakes: parseStakes(env.RESULT_STAKES),
        expirySeconds: Math.round((Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600),
    };
}

module.exports = { evaluateSignal, formatResult, resultFor, parseStakes, readResultConfig };
