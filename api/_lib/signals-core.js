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
function formatTelegram(sig, { siteUrl, newsNote } = {}) {
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
        // newsNote is already HTML-safe text built by news.js
        ...(newsNote ? ['', newsNote] : []),
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
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const list = (v, fallback) => String(v || fallback).split(',').map(s => s.trim()).filter(Boolean);
    const tf = Number(env.WATCH_TIMEFRAME || 3600);
    const minRr = Number(env.MIN_RR || 2);
    const maxAge = Number(env.SIGNAL_MAX_AGE_CANDLES === undefined || env.SIGNAL_MAX_AGE_CANDLES === '' ? 3 : env.SIGNAL_MAX_AGE_CANDLES);
    return {
        symbols: list(env.WATCH_SYMBOLS, 'frxEURUSD'),
        timeframe: Number.isFinite(tf) && tf >= 60 ? tf : 3600,
        strategies: list(env.WATCH_STRATEGIES, '1,2,3,4,5').map(Number).filter(n => n >= 1 && n <= 5),
        minRr: Number.isFinite(minRr) && minRr > 0 ? minRr : 2,
        // Only send setups whose break of structure happened at most this many candles ago.
        maxAgeCandles: Number.isFinite(maxAge) && maxAge >= 0 ? maxAge : 3,
        // Pacing against Deriv's limit (220 "other" requests per minute): 3 markets at a time, 1 second apart.
        concurrency: Math.min(10, Math.max(1, num(env.WATCH_CONCURRENCY, 3))),
        batchGapMs: Math.max(0, num(env.WATCH_BATCH_GAP_MS, 1000)),
        // Stop starting new markets after this long; the rest are done first on the next run.
        budgetMs: Math.max(1000, num(env.WATCH_BUDGET_MS, 45000)),
        // Pause between Telegram messages (Telegram allows about 20 per minute to one channel).
        telegramGapMs: Math.max(0, num(env.TELEGRAM_GAP_MS, 1100)),
    };
}

/** The markets to watch: the database watchlist if it has any rows, otherwise WATCH_SYMBOLS from the environment. */
function resolveWatchSymbols(rows, envSymbols) {
    const list = rows && rows.length ? rows.filter(r => r.enabled).map(r => r.symbol) : envSymbols;
    return Array.from(new Set(list));
}

/**
 * A trade only makes sense if its levels are on the right sides of the entry:
 * BUY needs stop loss < entry < take profit, SELL needs take profit < entry < stop loss.
 * Returns null when the levels are fine, or a short reason when they are not.
 */
function levelsProblem(plan) {
    const { side, entry, stopLoss, takeProfit } = plan;
    if (![entry, stopLoss, takeProfit].every(Number.isFinite)) return 'a price level is missing';
    if (side === 'BUY') {
        if (!(stopLoss < entry)) return 'stop loss is not below the entry for a BUY';
        if (!(takeProfit > entry)) return 'take profit is not above the entry for a BUY';
    } else if (side === 'SELL') {
        if (!(stopLoss > entry)) return 'stop loss is not above the entry for a SELL';
        if (!(takeProfit < entry)) return 'take profit is not below the entry for a SELL';
    } else return 'unknown side';
    return null;
}

/**
 * The checks every setup must pass before it counts as a signal, used by the live watcher AND the
 * backtest so they can never disagree: fresh enough, sane levels, enough reward.
 * Returns { age (candles since the break of structure), problem (text, or null when it passes) }.
 */
function setupCheck(analysis, lastClosed, cfg) {
    const bosTime = analysis.bos && analysis.bos.bosTime;
    const age = bosTime ? Math.round((lastClosed - bosTime) / cfg.timeframe) : 0;
    if (age > cfg.maxAgeCandles) return { age, problem: `Setup is ${age} candles old (limit ${cfg.maxAgeCandles})` };
    const bad = levelsProblem(analysis.plan);
    if (bad) return { age, problem: `Impossible trade levels: ${bad}` };
    if (analysis.plan.rr < cfg.minRr) return { age, problem: `RR ${analysis.plan.rr.toFixed(2)} below minimum ${cfg.minRr}` };
    return { age, problem: null };
}

/** Open time of the candle that closed most recently, by the clock. */
const expectedLastClosed = (nowSec, tf) => Math.floor(nowSec / tf) * tf - tf;

module.exports = { timeframeLabel, dedupeKey, escapeHtml, gmtStamp, formatTelegram, signalsPageUrl, readConfig, resolveWatchSymbols, expectedLastClosed, levelsProblem, setupCheck };
