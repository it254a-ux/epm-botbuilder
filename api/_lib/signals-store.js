// Database helpers for the signal machine (Neon Postgres, same database as the rest of the site).
// Tables are created automatically the first time they are needed ("IF NOT EXISTS"), so no
// manual SQL is required. The same statements are also listed in schema.sql for reference.

// Remember which database clients already have their tables (one client per warm server instance).
const prepared = new WeakSet();

async function ensureTables(sql) {
    if (prepared.has(sql)) return;
    await sql`
        CREATE TABLE IF NOT EXISTS signals (
            id                  SERIAL PRIMARY KEY,
            dedupe_key          TEXT NOT NULL UNIQUE,
            symbol              TEXT NOT NULL,
            symbol_name         TEXT,
            market              TEXT,
            strategy_id         INTEGER NOT NULL,
            strategy_name       TEXT NOT NULL,
            timeframe           INTEGER NOT NULL,
            side                TEXT NOT NULL,
            entry               DOUBLE PRECISION NOT NULL,
            stop_loss           DOUBLE PRECISION NOT NULL,
            take_profit         DOUBLE PRECISION NOT NULL,
            rr                  DOUBLE PRECISION NOT NULL,
            status              TEXT NOT NULL DEFAULT 'active',
            candle_time         BIGINT NOT NULL,
            telegram_sent       BOOLEAN NOT NULL DEFAULT false,
            telegram_message_id BIGINT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS signals_created_idx ON signals (created_at DESC)`;
    // Result tracking (added later: older databases get these columns automatically).
    await sql`ALTER TABLE signals ADD COLUMN IF NOT EXISTS entered_time BIGINT`;
    await sql`ALTER TABLE signals ADD COLUMN IF NOT EXISTS closed_time BIGINT`;
    await sql`ALTER TABLE signals ADD COLUMN IF NOT EXISTS result_sent BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE signals ADD COLUMN IF NOT EXISTS result_message_id BIGINT`;
    await sql`
        CREATE TABLE IF NOT EXISTS signal_watch_state (
            symbol      TEXT NOT NULL,
            timeframe   INTEGER NOT NULL,
            last_candle BIGINT NOT NULL,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (symbol, timeframe)
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS signal_watchlist (
            symbol     TEXT PRIMARY KEY,
            enabled    BOOLEAN NOT NULL DEFAULT true,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS signal_news_cache (
            id         INTEGER PRIMARY KEY,
            events     JSONB NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    // Setups that are ready but whose entry price has not been touched yet: nothing is sent until it is.
    await sql`
        CREATE TABLE IF NOT EXISTS signal_pending (
            id            SERIAL PRIMARY KEY,
            dedupe_key    TEXT NOT NULL UNIQUE,
            symbol        TEXT NOT NULL,
            symbol_name   TEXT,
            market        TEXT,
            strategy_id   INTEGER NOT NULL,
            strategy_name TEXT NOT NULL,
            timeframe     INTEGER NOT NULL,
            side          TEXT NOT NULL,
            entry         DOUBLE PRECISION NOT NULL,
            stop_loss     DOUBLE PRECISION NOT NULL,
            take_profit   DOUBLE PRECISION NOT NULL,
            rr            DOUBLE PRECISION NOT NULL,
            setup_time    BIGINT NOT NULL,
            expires_at    BIGINT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'waiting',
            reason        TEXT,
            news_note     TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS signal_alerts (
            key        TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    prepared.add(sql);
}

/** Saves a new signal. Returns its id, or null if the same signal was already saved (duplicate). */
async function insertSignal(sql, s) {
    const rows = await sql`
        INSERT INTO signals (dedupe_key, symbol, symbol_name, market, strategy_id, strategy_name, timeframe,
                             side, entry, stop_loss, take_profit, rr, candle_time, entered_time)
        VALUES (${s.key}, ${s.symbol}, ${s.symbolName}, ${s.market}, ${s.strategyId}, ${s.strategyName}, ${s.timeframe},
                ${s.side}, ${s.entry}, ${s.stopLoss}, ${s.takeProfit}, ${s.rr}, ${s.time}, ${s.enteredAt ?? null})
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
    `;
    return rows.length ? rows[0].id : null;
}

async function markTelegramSent(sql, id, messageId) {
    await sql`UPDATE signals SET telegram_sent = true, telegram_message_id = ${messageId ?? null}, updated_at = now() WHERE id = ${id}`;
}

/** Signals saved but not delivered to Telegram yet (Telegram was down): retried on the next run. */
async function getUnsent(sql) {
    const rows = await sql`
        SELECT id, symbol, symbol_name, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr, candle_time, entered_time
        FROM signals
        WHERE telegram_sent = false AND status = 'active' AND timeframe >= 900 AND created_at > now() - interval '3 hours'
        ORDER BY id ASC LIMIT 5
    `;
    return rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        symbolName: r.symbol_name,
        strategyName: r.strategy_name,
        timeframe: Number(r.timeframe),
        side: r.side,
        entry: Number(r.entry),
        stopLoss: Number(r.stop_loss),
        takeProfit: Number(r.take_profit),
        rr: Number(r.rr),
        time: Number(r.candle_time),
        enteredAt: r.entered_time === null || r.entered_time === undefined ? undefined : Number(r.entered_time),
    }));
}

const toSignal = r => ({
    id: r.id,
    symbol: r.symbol,
    symbolName: r.symbol_name,
    strategyName: r.strategy_name,
    timeframe: Number(r.timeframe),
    side: r.side,
    entry: Number(r.entry),
    stopLoss: Number(r.stop_loss),
    takeProfit: Number(r.take_profit),
    rr: Number(r.rr),
    time: Number(r.candle_time),
    telegramSent: r.telegram_sent === true,
    telegramMessageId: r.telegram_message_id === null || r.telegram_message_id === undefined ? null : Number(r.telegram_message_id),
    enteredTime: r.entered_time === null || r.entered_time === undefined ? null : Number(r.entered_time),
    closedTime: r.closed_time === null || r.closed_time === undefined ? null : Number(r.closed_time),
    status: r.status,
});

/** Signals still waiting for a result (not yet closed). */
/** M5 (M15 + M5 mode) signals that were saved but not delivered: only worth retrying for a few minutes. */
async function getUnsentMtf(sql) {
    const rows = await sql`
        SELECT id, symbol, symbol_name, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr, candle_time, entered_time
        FROM signals
        WHERE telegram_sent = false AND status = 'active' AND timeframe < 900 AND created_at > now() - interval '10 minutes'
        ORDER BY id ASC LIMIT 5
    `;
    return rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        symbolName: r.symbol_name,
        strategyName: r.strategy_name,
        timeframe: Number(r.timeframe),
        side: r.side,
        entry: Number(r.entry),
        stopLoss: Number(r.stop_loss),
        takeProfit: Number(r.take_profit),
        rr: Number(r.rr),
        time: Number(r.candle_time),
    }));
}

/** Was a signal saved for this market and timeframe in the last `minutes` minutes? */
async function hasRecentSignal(sql, symbol, timeframe, minutes, strategyName = null) {
    const rows = strategyName === null
        ? await sql`
            SELECT 1 FROM signals
            WHERE symbol = ${symbol} AND timeframe = ${timeframe} AND created_at > now() - (${minutes} * interval '1 minute')
            LIMIT 1
        `
        : await sql`
            SELECT 1 FROM signals
            WHERE symbol = ${symbol} AND timeframe = ${timeframe} AND strategy_name = ${strategyName} AND created_at > now() - (${minutes} * interval '1 minute')
            LIMIT 1
        `;
    return rows.length > 0;
}

/** Heads-up alerts (not trades): true the first time a key is claimed, false if it was already claimed. */
async function claimAlert(sql, key) {
    const rows = await sql`INSERT INTO signal_alerts (key) VALUES (${key}) ON CONFLICT (key) DO NOTHING RETURNING key`;
    return rows.length > 0;
}

/** Give a claimed alert back (Telegram refused it), so the next run can send it. */
async function releaseAlert(sql, key) {
    await sql`DELETE FROM signal_alerts WHERE key = ${key}`;
}

async function getOpenSignals(sql) {
    const rows = await sql`
        SELECT id, symbol, symbol_name, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr, candle_time,
               telegram_sent, telegram_message_id, entered_time, closed_time, status
        FROM signals WHERE status = 'active' ORDER BY id ASC LIMIT 40
    `;
    return rows.map(toSignal);
}

/**
 * Closes a signal with its result. Returns true only for the run that actually closed it
 * (so two overlapping runs can never both send the result).
 * If the original message never reached Telegram there is nothing to reply to, so no result message is owed.
 */
async function closeSignal(sql, sig, outcome) {
    const owed = sig.telegramSent === true;
    const rows = await sql`
        UPDATE signals
        SET status = ${outcome.status}, entered_time = ${outcome.enteredTime}, closed_time = ${outcome.closedTime},
            result_sent = ${!owed}, updated_at = now()
        WHERE id = ${sig.id} AND status = 'active'
        RETURNING id
    `;
    return rows.length > 0;
}

async function markResultSent(sql, id, messageId) {
    await sql`UPDATE signals SET result_sent = true, result_message_id = ${messageId ?? null}, updated_at = now() WHERE id = ${id}`;
}

/** Results that were decided but not delivered to Telegram yet: retried on the next run. */
async function getUnsentResults(sql) {
    const rows = await sql`
        SELECT id, symbol, symbol_name, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr, candle_time,
               telegram_sent, telegram_message_id, entered_time, closed_time, status
        FROM signals
        WHERE status <> 'active' AND result_sent = false AND updated_at > now() - interval '6 hours'
        ORDER BY id ASC LIMIT 10
    `;
    return rows.map(toSignal);
}

const toPending = r => ({
    id: r.id,
    key: r.dedupe_key,
    symbol: r.symbol,
    symbolName: r.symbol_name,
    market: r.market,
    strategyId: Number(r.strategy_id),
    strategyName: r.strategy_name,
    timeframe: Number(r.timeframe),
    side: r.side,
    entry: Number(r.entry),
    stopLoss: Number(r.stop_loss),
    takeProfit: Number(r.take_profit),
    rr: Number(r.rr),
    time: Number(r.setup_time), // open time of the candle that completed the setup (same meaning as signals.candle_time)
    expiresAt: Number(r.expires_at),
});

/**
 * Puts a ready setup on the waiting list. Returns its id, or null when this setup is already waiting,
 * was already dropped earlier, or was already sent as a signal (so it can never be queued twice).
 */
async function insertPending(sql, p) {
    const rows = await sql`
        INSERT INTO signal_pending (dedupe_key, symbol, symbol_name, market, strategy_id, strategy_name, timeframe,
                                    side, entry, stop_loss, take_profit, rr, setup_time, expires_at, news_note)
        SELECT ${p.key}, ${p.symbol}, ${p.symbolName}, ${p.market}, ${p.strategyId}, ${p.strategyName}, ${p.timeframe},
               ${p.side}, ${p.entry}, ${p.stopLoss}, ${p.takeProfit}, ${p.rr}, ${p.time}, ${p.expiresAt}, ${p.newsNote ?? null}
        WHERE NOT EXISTS (SELECT 1 FROM signals WHERE dedupe_key = ${p.key})
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
    `;
    return rows.length ? rows[0].id : null;
}

/** Setups still waiting for their entry to be touched. */
async function getWaiting(sql) {
    const rows = await sql`
        SELECT id, dedupe_key, symbol, symbol_name, market, strategy_id, strategy_name, timeframe, side, entry, stop_loss,
               take_profit, rr, setup_time, expires_at
        FROM signal_pending WHERE status = 'waiting' ORDER BY id ASC LIMIT 60
    `;
    return rows.map(toPending);
}

/**
 * Takes a waiting setup out of the waiting list ('sent', 'cancelled' or 'missed'). Returns true only for the run that
 * really did it, so two overlapping runs can never both act on the same setup.
 */
async function resolvePending(sql, id, status, reason) {
    const rows = await sql`
        UPDATE signal_pending SET status = ${status}, reason = ${reason ?? null}, updated_at = now()
        WHERE id = ${id} AND status = 'waiting' RETURNING id
    `;
    return rows.length > 0;
}

async function getLastCandle(sql, symbol, timeframe) {
    const rows = await sql`SELECT last_candle FROM signal_watch_state WHERE symbol = ${symbol} AND timeframe = ${timeframe}`;
    return rows.length ? Number(rows[0].last_candle) : null;
}

async function setLastCandle(sql, symbol, timeframe, lastCandle) {
    await sql`
        INSERT INTO signal_watch_state (symbol, timeframe, last_candle) VALUES (${symbol}, ${timeframe}, ${lastCandle})
        ON CONFLICT (symbol, timeframe) DO UPDATE SET last_candle = EXCLUDED.last_candle, updated_at = now()
    `;
}

/** Every market that has been switched on or off in the admin page. */
async function getWatchlist(sql) {
    const rows = await sql`SELECT symbol, enabled FROM signal_watchlist ORDER BY symbol`;
    return rows.map(r => ({ symbol: r.symbol, enabled: !!r.enabled }));
}

/** Saves on/off switches. `entries` is [[symbol, true|false], ...]. */
async function setWatchlist(sql, entries) {
    if (!entries.length) return;
    const symbols = entries.map(e => e[0]);
    const flags = entries.map(e => !!e[1]);
    await sql`
        INSERT INTO signal_watchlist (symbol, enabled)
        SELECT * FROM unnest(${symbols}::text[], ${flags}::boolean[])
        ON CONFLICT (symbol) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
    `;
}

/** When each market was last checked: Map(symbol -> { lastCandle, updatedAt in ms }). */
async function getStates(sql, timeframe) {
    const rows = await sql`SELECT symbol, last_candle, updated_at FROM signal_watch_state WHERE timeframe = ${timeframe}`;
    return new Map(rows.map(r => [r.symbol, { lastCandle: Number(r.last_candle), updatedAt: new Date(r.updated_at).getTime() }]));
}

/** The cached economic calendar: { events, fetchedAt in ms } or null. */
async function getNewsCache(sql) {
    const rows = await sql`SELECT events, fetched_at FROM signal_news_cache WHERE id = 1`;
    if (!rows.length) return null;
    const events = typeof rows[0].events === 'string' ? JSON.parse(rows[0].events) : rows[0].events;
    return { events: Array.isArray(events) ? events : [], fetchedAt: new Date(rows[0].fetched_at).getTime() };
}

async function setNewsCache(sql, events) {
    await sql`
        INSERT INTO signal_news_cache (id, events, fetched_at) VALUES (1, ${JSON.stringify(events)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET events = EXCLUDED.events, fetched_at = now()
    `;
}

async function listSignals(sql, limit) {
    const rows = await sql`
        SELECT id, symbol, symbol_name, market, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr,
               status, candle_time, entered_time, closed_time, created_at
        FROM signals ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        symbolName: r.symbol_name,
        market: r.market,
        strategyName: r.strategy_name,
        timeframe: Number(r.timeframe),
        side: r.side,
        entry: Number(r.entry),
        stopLoss: Number(r.stop_loss),
        takeProfit: Number(r.take_profit),
        rr: Number(r.rr),
        status: r.status,
        time: Number(r.candle_time),
        enteredTime: r.entered_time === null || r.entered_time === undefined ? null : Number(r.entered_time),
        closedTime: r.closed_time === null || r.closed_time === undefined ? null : Number(r.closed_time),
        createdAt: r.created_at,
    }));
}

module.exports = { claimAlert, releaseAlert, getUnsentMtf, hasRecentSignal, insertPending, getWaiting, resolvePending, getNewsCache, setNewsCache, getWatchlist, setWatchlist, getStates, ensureTables, insertSignal, markTelegramSent, getUnsent, getOpenSignals, closeSignal, markResultSent, getUnsentResults, getLastCandle, setLastCandle, listSignals };
