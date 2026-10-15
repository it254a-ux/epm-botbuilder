// Economic-news awareness for the signal machine.
//
// Source: the free public ForexFactory calendar feed published by Fair Economy (this week only).
// It is unofficial, so everything here FAILS OPEN: if the feed cannot be read, signals are sent
// as normal (and the run report says the news check was unavailable). The feed is cached in the
// database and re-read at most every NEWS_REFRESH_HOURS (default 6), because it rate-limits.
//
//   BLACKOUT: a signal on a market affected by a high-impact event inside the blackout window
//             (default 120 min before to 30 min after) is HELD, not saved, so it is sent on a later
//             run if the setup is still ready and fresh once the news has passed.
//   WARNING : a signal that is sent while a high-impact event is coming within the next
//             NEWS_WARN_HOURS (default 24) gets a "high-impact news" line in the message.
const { gmtStamp, escapeHtml } = require('./signals-core');

const DEFAULT_FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const METALS = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
// Deriv index symbols -> the currency whose news moves them. Unknown indices get no news filter.
const INDEX_CURRENCY = {
    OTC_NDX: 'USD', OTC_SPC: 'USD', OTC_DJI: 'USD',
    OTC_FTSE: 'GBP', OTC_GDAXI: 'EUR', OTC_FCHI: 'EUR', OTC_SX5E: 'EUR', OTC_AEX: 'EUR', OTC_IBEX35: 'EUR',
    OTC_N225: 'JPY', OTC_AS51: 'AUD', OTC_SSMI: 'CHF',
};

function readNewsConfig(env = process.env) {
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    return {
        enabled: String(env.NEWS_FILTER || 'on').toLowerCase() !== 'off',
        impacts: String(env.NEWS_IMPACT || 'high').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        beforeMin: Math.max(0, num(env.NEWS_BLACKOUT_BEFORE_MIN, 120)),
        afterMin: Math.max(0, num(env.NEWS_BLACKOUT_AFTER_MIN, 30)),
        warnHours: Math.max(0, num(env.NEWS_WARN_HOURS, 24)),
        refreshHours: Math.max(0.1, num(env.NEWS_REFRESH_HOURS, 6)),
        url: env.NEWS_FEED_URL || DEFAULT_FEED,
    };
}

/** Raw feed rows -> [{ title, currency, time (epoch seconds), impact (lowercase) }], bad rows dropped. */
function normalizeEvents(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const e of raw) {
        if (!e || typeof e !== 'object') continue;
        const ms = Date.parse(e.date);
        const currency = String(e.country || e.currency || '').toUpperCase();
        if (!Number.isFinite(ms) || !/^[A-Z]{3}$/.test(currency)) continue;
        out.push({ title: String(e.title || 'Event').slice(0, 120), currency, time: Math.floor(ms / 1000), impact: String(e.impact || '').toLowerCase() });
    }
    return out;
}

/** Which currencies' news matters for a market. [] means "no news filter for this market". */
function currenciesFor(symbol, market) {
    if (market === 'synthetic_index') return [];
    if (/^cry/i.test(symbol)) return ['USD'];
    const fx = /^frx([A-Z]{3})([A-Z]{3})$/.exec(symbol);
    if (fx) return [fx[1], fx[2]].filter(c => !METALS.has(c));
    return INDEX_CURRENCY[symbol] ? [INDEX_CURRENCY[symbol]] : [];
}

/** { blackout, upcoming } for one market: the event that blocks the signal, and the next one to warn about. */
function check(currencies, events, nowSec, cfg) {
    const relevant = events.filter(e => currencies.includes(e.currency) && cfg.impacts.includes(e.impact));
    const blackout = relevant.find(e => e.time >= nowSec - cfg.afterMin * 60 && e.time <= nowSec + cfg.beforeMin * 60) || null;
    const upcoming = relevant
        .filter(e => e.time > nowSec && e.time <= nowSec + cfg.warnHours * 3600)
        .sort((a, b) => a.time - b.time)[0] || null;
    return { blackout, upcoming };
}

function relative(deltaSec) {
    const m = Math.round(Math.abs(deltaSec) / 60);
    const text = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
    return deltaSec >= 0 ? `in ${text}` : `${text} ago`;
}

/** Plain description of an event, safe to put in a Telegram HTML message. */
function describe(event, nowSec) {
    return `${event.currency} ${escapeHtml(event.title)} at ${gmtStamp(event.time)} (${relative(event.time - nowSec)})`;
}

const newsNote = (event, nowSec) => `📰 High-impact news ahead: ${describe(event, nowSec)}`;

async function fetchFeed(url, timeoutMs = 8000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`news feed answered ${res.status}`);
        return normalizeEvents(await res.json());
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Events for this run: from the database cache if it is fresh, otherwise from the feed
 * (saved to the cache unless save is false), otherwise from a stale cache. Never throws.
 * Returns { status: 'cache' | 'fresh' | 'stale cache' | 'unavailable: why', events }.
 */
async function loadEvents(store, sql, cfg, { save = true, nowMs = Date.now() } = {}) {
    let cached = null;
    try { cached = sql ? await store.getNewsCache(sql) : null; } catch (e) { cached = null; }
    if (cached && nowMs - cached.fetchedAt < cfg.refreshHours * 3600 * 1000) return { status: 'cache', events: cached.events };
    try {
        const events = await fetchFeed(cfg.url);
        if (save && sql) { try { await store.setNewsCache(sql, events); } catch (e) { /* cache is optional */ } }
        return { status: 'fresh', events };
    } catch (err) {
        const why = err && err.name === 'AbortError' ? 'timed out' : (err && err.message) || 'failed';
        if (cached) return { status: `stale cache (feed ${why})`, events: cached.events };
        return { status: `unavailable: ${why}`, events: [] };
    }
}

module.exports = { readNewsConfig, normalizeEvents, currenciesFor, check, describe, newsNote, fetchFeed, loadEvents, DEFAULT_FEED };
