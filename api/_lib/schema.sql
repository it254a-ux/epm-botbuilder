-- Per-site settings. One row per operator domain.
-- The server now creates all of this by itself on an empty Turso database (api/_lib/db.js).
-- Keep api/_lib/schema-text.js identical to this file (a test checks it). Safe to re-run.
CREATE TABLE IF NOT EXISTS sites (
    id            SERIAL PRIMARY KEY,
    domain        TEXT NOT NULL UNIQUE,          -- lowercase host, no port, e.g. trade.alice.com
    name          TEXT NOT NULL,
    primary_color TEXT,                          -- #rrggbb
    font          TEXT,                          -- one of the supported fonts
    logo_url      TEXT,                          -- https:// URL
    whatsapp      TEXT,                          -- digits only, with country code
    phone         TEXT,
    support_email TEXT,
    telegram      TEXT,                          -- username, no @
    status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'suspended'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_domain_idx ON sites (domain);

-- ===== Step 2: accounts, plans, sessions =====
CREATE TABLE IF NOT EXISTS owners (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,            -- lowercase
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'operator', -- 'operator' | 'admin' (admins are created only by scripts/create-admin.js)
    disabled      BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,                   -- SHA-256 of the cookie token
    owner_id   INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_owner_idx ON sessions (owner_id);

CREATE TABLE IF NOT EXISTS auth_attempts (         -- rate limiting counters
    key          TEXT PRIMARY KEY,
    count        INTEGER NOT NULL,
    window_start TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id         SERIAL PRIMARY KEY,
    owner_id   INTEGER,
    action     TEXT NOT NULL,
    target     TEXT,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'custom';        -- 'free' (your subdomain) | 'custom' (their own domain)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS vision TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS mission TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS custom_domain_requested TEXT;               -- upgrade request waiting for approval
ALTER TABLE sites ADD COLUMN IF NOT EXISTS commission_rate_override NUMERIC(5,2);      -- optional per-operator deal (percent YOU keep)
-- One site per operator account.
CREATE UNIQUE INDEX IF NOT EXISTS sites_owner_unique ON sites (owner_id) WHERE owner_id IS NOT NULL;

-- Effective-dated record of the % YOU keep, so an upgrade only changes the rate going forward.
CREATE TABLE IF NOT EXISTS site_rate_history (
    id             SERIAL PRIMARY KEY,
    site_id        INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    plan           TEXT NOT NULL,
    platform_share NUMERIC(5,2) NOT NULL,          -- e.g. 25.00 or 15.00
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_rate_history_site_idx ON site_rate_history (site_id, effective_from);

-- ===== Step 3: site history (shown on the operator's Deployments page) =====
CREATE TABLE IF NOT EXISTS site_events (
    id         SERIAL PRIMARY KEY,
    site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    event      TEXT NOT NULL,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_events_site_idx ON site_events (site_id, id DESC);

-- ===== Forex Trader AI usage (limits per visitor and per day) =====
-- Created automatically by api/_lib/forex-limit.js the first time it is needed; listed here for reference.
CREATE TABLE IF NOT EXISTS forex_ai_usage (
    id         BIGSERIAL PRIMARY KEY,
    visitor    TEXT NOT NULL,                 -- hashed visitor address, never the readable IP
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forex_ai_usage_time_idx ON forex_ai_usage (created_at);
CREATE INDEX IF NOT EXISTS forex_ai_usage_visitor_idx ON forex_ai_usage (visitor, created_at);

-- Admin on/off switches (created automatically by api/_lib/app-flags.js the first time they are needed).
CREATE TABLE IF NOT EXISTS app_flags (
    key        TEXT PRIMARY KEY,
    on_state   BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Signal machine (Telegram + website feed) =====
-- These are created automatically by the app the first time they are needed, so running this
-- by hand is optional. Safe to re-run.
CREATE TABLE IF NOT EXISTS signals (
    id                  SERIAL PRIMARY KEY,
    dedupe_key          TEXT NOT NULL UNIQUE,            -- market|strategy|timeframe|side|entry: blocks duplicates
    symbol              TEXT NOT NULL,
    symbol_name         TEXT,
    market              TEXT,
    strategy_id         INTEGER NOT NULL,
    strategy_name       TEXT NOT NULL,
    timeframe           INTEGER NOT NULL,                -- seconds
    side                TEXT NOT NULL,                   -- 'BUY' | 'SELL'
    entry               DOUBLE PRECISION NOT NULL,
    stop_loss           DOUBLE PRECISION NOT NULL,
    take_profit         DOUBLE PRECISION NOT NULL,
    rr                  DOUBLE PRECISION NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'hit_tp' | 'hit_sl' | 'invalidated'
    candle_time         BIGINT NOT NULL,                 -- open time of the candle whose close produced the signal
    telegram_sent       BOOLEAN NOT NULL DEFAULT false,
    telegram_message_id BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signals_created_idx ON signals (created_at DESC);

CREATE TABLE IF NOT EXISTS signal_watch_state (
    symbol      TEXT NOT NULL,
    timeframe   INTEGER NOT NULL,
    last_candle BIGINT NOT NULL,                         -- last candle already analysed
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol, timeframe)
);

-- Result tracking for signals (created automatically by api/_lib/signals-store.js; listed here for reference).
ALTER TABLE signals ADD COLUMN IF NOT EXISTS entered_time BIGINT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS closed_time BIGINT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS result_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS result_message_id BIGINT;

-- Ready setups waiting for price to touch their entry (created automatically by api/_lib/signals-store.js; listed here for reference).
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
);

-- ===== Free Bots (Trading Bots -> Freebots tab) =====
-- Was created by hand in Neon originally and never tracked: without it the Freebots tab says "Failed to load bots".
-- Safe to re-run. Bots are added again from the Admin tab.
CREATE TABLE IF NOT EXISTS free_bots (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    market        TEXT NOT NULL,
    risk_level    TEXT NOT NULL,
    contract_type TEXT,
    xml_content   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
