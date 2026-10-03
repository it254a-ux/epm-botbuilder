-- Per-site settings. One row per operator domain.
-- Run once against your Neon database (SQL editor) before deploying the
-- site-settings endpoint. Safe to re-run.
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
