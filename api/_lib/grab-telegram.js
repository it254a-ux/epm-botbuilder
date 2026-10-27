// Telegram texts for the Liquidity Grab Reversal (stop-hunt) strategy. Plain functions, no network.
// The strategy itself lives in src/pages/forex-trader/grab.ts (generated copy: api/_lib/grab.js).
const { px } = require('./engine');
const { escapeHtml, gmtStamp } = require('./signals-core');

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

/** Deriv multiplier and the take profit (as a multiple of the stake) used in the message. */
function readGrabConfig(env = process.env) {
    return {
        multiplier: Math.max(1, num(env.GRAB_MULTIPLIER, 100)),
        tpMultiple: Math.max(0.1, num(env.GRAB_TP_STAKES, 2)),
        maxOvershoot: num(env.GRAB_MAX_OVERSHOOT, 0.25),
        cooldownMin: Math.max(0, num(env.GRAB_COOLDOWN_MIN, 30)),
    };
}

/** Prices at which a multiplier trade reaches the take profit and is stopped out by Deriv (loss = the whole stake). */
function targets(side, entry, { multiplier, tpMultiple }) {
    const dir = side === 'BUY' ? 1 : -1;
    const tpMove = tpMultiple / multiplier;
    const outMove = 1 / multiplier;
    return {
        tpPrice: entry * (1 + dir * tpMove),
        stopOutPrice: entry * (1 - dir * outMove),
        tpPercent: tpMove * 100,
        outPercent: outMove * 100,
    };
}

const colour = side => (side === 'BUY' ? '🟢' : '🔴');
const green = side => (side === 'BUY' ? 'red' : 'green'); // colour of the tall footprint candles

/** Heads-up: a day extreme was taken with an Institutional Footprint. Not a trade. */
function formatGrabWatch(r, symbolName, { siteUrl, newsNote } = {}) {
    const high = r.side === 'SELL';
    return [
        `👀 <b>WATCH</b>: ${escapeHtml(symbolName)} took the <b>${escapeHtml(r.levelName)}</b>`,
        '🚫 Do NOT enter yet.',
        '',
        `1️⃣ ${escapeHtml(r.levelName)}${r.kind === 'today' ? '' : `: <code>${px(r.levelPrice)}</code>`}`,
        `2️⃣ Institutional Footprint: ${r.footprint.count} tall ${green(r.side)} M5 candles ran into the level${r.footprint.giant ? ' (one of them giant)' : ''}`,
        `3️⃣ First extreme (not traded): <code>${px(r.extreme.price)}</code> at ${gmtStamp(r.extreme.time)}`,
        '',
        `⏳ The trade comes only if price pulls back, then comes back to the <b>stop-hunt line</b> <code>${px(r.stopLine)}</code> (where the stops of the first push sit) and a candle closes back ${high ? 'below' : 'above'} it.`,
        `🎯 If it does: <b>${r.side}</b>.`,
        ...(newsNote ? ['', newsNote] : []),
        ...(siteUrl ? ['', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`] : []),
        '',
        '⚠️ Signals only, not financial advice.',
    ].join('\n');
}

/** The signal itself: every step that led to it, then the plan (no stop loss; take profit as a multiple of the stake). */
function formatGrabSignal(r, symbolName, cfg, { siteUrl, newsNote } = {}) {
    const high = r.side === 'SELL';
    const t = targets(r.side, r.entry, cfg);
    const sharePct = Math.round(r.touch.overshootShare * 100);
    return [
        `${colour(r.side)} <b>${r.side}</b>: ${escapeHtml(symbolName)}`,
        '📊 Liquidity Grab Reversal (M5)',
        '',
        `1️⃣ Key level: <b>${escapeHtml(r.levelName)}</b>${r.kind === 'today' ? '' : ` <code>${px(r.levelPrice)}</code>`} was taken`,
        `2️⃣ Institutional Footprint: ${r.footprint.count} tall ${green(r.side)} candles ran into it${r.footprint.giant ? ' (one of them giant)' : ''}`,
        `3️⃣ First extreme (not traded): <code>${px(r.extreme.price)}</code> at ${gmtStamp(r.extreme.time)}`,
        ...(r.pullback ? [`4️⃣ Pullback to <code>${px(r.pullback.price)}</code>`] : []),
        `5️⃣ Stop-hunt line: <code>${px(r.stopLine)}</code> (the first extreme plus a little: where the stops sit)`,
        `6️⃣ Touch: at ${gmtStamp(r.touch.time + 300)} a candle reached the line, only ${sharePct}% of it beyond the line, and closed back ${high ? 'below' : 'above'} it at <code>${px(r.touch.close)}</code>. <b>This is the entry.</b>`,
        '',
        `🎯 Entry: <code>${px(r.entry)}</code>`,
        '🛑 No stop loss',
        `✅ Take profit: ${cfg.tpMultiple}× your stake (${cfg.tpMultiple * 100}% profit)`,
        `   At ×${cfg.multiplier} that is price at <code>${px(t.tpPrice)}</code> (${t.tpPercent.toFixed(2)}% ${high ? 'down' : 'up'})`,
        `⚠️ With no stop loss Deriv closes the trade when the loss reaches your whole stake, at about <code>${px(t.stopOutPrice)}</code> (${t.outPercent.toFixed(2)}% against you at ×${cfg.multiplier}). A lower multiplier gives more room.`,
        ...(newsNote ? ['', newsNote] : []),
        ...(siteUrl ? ['', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`] : []),
        '',
        '⚠️ Signals only, not financial advice. Keep the stake small: with no stop loss one loss can cost the whole stake.',
    ].join('\n');
}

/** Chart picture first (short caption), then the full step-by-step text (a caption is limited to 1024 characters). Text only if the picture fails. */
async function deliverGrab(text, chartInput) {
    const { sendTelegram, sendTelegramPhoto } = require('./telegram');
    const { renderGrabPng } = require('./signal-chart-grab');
    let why = null;
    try {
        const png = renderGrabPng(chartInput);
        const caption = text.split('\n').slice(0, 2).join('\n');
        await sendTelegramPhoto(png, caption);
        const sent = await sendTelegram(text);
        return { messageId: sent.messageId, picture: true };
    } catch (err) {
        why = err.message;
        console.error('grab deliver: picture failed, sending text only:', why);
    }
    const sent = await sendTelegram(text);
    return { messageId: sent.messageId, picture: `failed: ${why}` };
}

module.exports = { readGrabConfig, targets, formatGrabWatch, formatGrabSignal, deliverGrab };
