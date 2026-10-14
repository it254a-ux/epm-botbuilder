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
    prepared.add(sql);
}

/** Saves a new signal. Returns its id, or null if the same signal was already saved (duplicate). */
async function insertSignal(sql, s) {
    const rows = await sql`
        INSERT INTO signals (dedupe_key, symbol, symbol_name, market, strategy_id, strategy_name, timeframe,
                             side, entry, stop_loss, take_profit, rr, candle_time)
        VALUES (${s.key}, ${s.symbol}, ${s.symbolName}, ${s.market}, ${s.strategyId}, ${s.strategyName}, ${s.timeframe},
                ${s.side}, ${s.entry}, ${s.stopLoss}, ${s.takeProfit}, ${s.rr}, ${s.time})
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
        SELECT id, symbol, symbol_name, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr, candle_time
        FROM signals
        WHERE telegram_sent = false AND status = 'active' AND created_at > now() - interval '3 hours'
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

async function listSignals(sql, limit) {
    const rows = await sql`
        SELECT id, symbol, symbol_name, market, strategy_name, timeframe, side, entry, stop_loss, take_profit, rr,
               status, candle_time, created_at
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
        createdAt: r.created_at,
    }));
}

module.exports = { getWatchlist, setWatchlist, getStates, ensureTables, insertSignal, markTelegramSent, getUnsent, getLastCandle, setLastCandle, listSignals };
