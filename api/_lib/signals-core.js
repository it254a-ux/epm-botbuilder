// Pure helpers for the signal machine (no network, no database), so they are easy to test.
const { px } = require('./engine');

const TF_LABELS = { 60: '1m', 120: '2m', 180: '3m', 300: '5m', 600: '10m', 900: '15m', 1800: '30m', 3600: '1h', 7200: '2h', 14400: '4h', 28800: '8h', 86400: '1d' };
const timeframeLabel = tf => TF_LABELS[tf] || `${tf}s`;

/** Same signal = same market + strategy + timeframe + side + entry. */
const dedupeKey = (symbol, strategyId, tf, side, entry) => `${symbol}|${strategyId}|${tf}|${side}|${px(entry)}`;

const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "2026-10-14 09:15 GMT" */
function gmtStamp(epochSeconds) {
    return new Date(epochSeconds * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' GMT';
}

/** The Telegram text for one signal. Uses Telegram HTML formatting. */
function formatTelegram(sig, { siteUrl } = {}) {
    const buy = sig.side === 'BUY';
    return [
        `${buy ? '🟢' : '🔴'} <b>${sig.side} SIGNAL</b>: ${escapeHtml(sig.symbolName || sig.symbol)}`,
        '',
        `📊 Strategy: ${escapeHtml(sig.strategyName)}`,
        `⏱ Timeframe: ${timeframeLabel(sig.timeframe)}`,
        `🎯 Entry: <code>${px(sig.entry)}</code>`,
        `🛑 Stop loss: <code>${px(sig.stopLoss)}</code>`,
        `✅ Take profit: <code>${px(sig.takeProfit)}</code>`,
        `⚖️ Risk : Reward = 1 : ${sig.rr.toFixed(2)}`,
        // sig.time is the OPEN time of the last closed candle; the signal exists from the moment that candle closed.
        `🕒 ${gmtStamp(sig.time + sig.timeframe)}`,
        ...(siteUrl ? ['', `🔗 <a href="${escapeHtml(siteUrl)}">Open the signals page</a>`] : []),
        '',
        '⚠️ Signals only, not financial advice.',
    ].join('\n');
}

/** Address of the public Signals page, used as the link under every Telegram message. */
function signalsPageUrl(env = process.env) {
    const base = String(env.SITE_URL || 'https://www.executiveprimemarkets.site').replace(/\/+$/, '');
    return `${base}/signals.html`;
}

/** Reads the watcher settings from environment variables (Phase 1: simple and explicit). */
function readConfig(env = process.env) {
    const list = (v, fallback) => String(v || fallback).split(',').map(s => s.trim()).filter(Boolean);
    const tf = Number(env.WATCH_TIMEFRAME || 900);
    const minRr = Number(env.MIN_RR || 2);
    const maxAge = Number(env.SIGNAL_MAX_AGE_CANDLES === undefined || env.SIGNAL_MAX_AGE_CANDLES === '' ? 3 : env.SIGNAL_MAX_AGE_CANDLES);
    return {
        symbols: list(env.WATCH_SYMBOLS, 'frxEURUSD'),
        timeframe: Number.isFinite(tf) && tf >= 60 ? tf : 900,
        strategies: list(env.WATCH_STRATEGIES, '1,2,3,4,5').map(Number).filter(n => n >= 1 && n <= 5),
        minRr: Number.isFinite(minRr) && minRr > 0 ? minRr : 2,
        // Only send setups whose break of structure happened at most this many candles ago.
        maxAgeCandles: Number.isFinite(maxAge) && maxAge >= 0 ? maxAge : 3,
    };
}

module.exports = { timeframeLabel, dedupeKey, escapeHtml, gmtStamp, formatTelegram, signalsPageUrl, readConfig };
