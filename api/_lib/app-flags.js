// Small on/off switches the admin can flip from the admin page. Stored in one tiny table that is
// created the first time it is needed. A switch that was never set uses its default.
const DEFAULTS = {
    // The account DOT94283012 is shown as "Real account" (on = today's behaviour).
    forced_real: true,
};

let ready = false;

async function ensureTable(sql) {
    if (ready) return;
    await sql`CREATE TABLE IF NOT EXISTS app_flags (
        key        TEXT PRIMARY KEY,
        on_state   BOOLEAN NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    ready = true;
}

async function getFlag(sql, key) {
    if (!(key in DEFAULTS)) return null;
    await ensureTable(sql);
    const rows = await sql`SELECT on_state FROM app_flags WHERE key = ${key} LIMIT 1`;
    return rows.length ? !!rows[0].on_state : DEFAULTS[key];
}

async function setFlag(sql, key, on) {
    if (!(key in DEFAULTS)) throw new Error('Unknown switch');
    await ensureTable(sql);
    await sql`INSERT INTO app_flags (key, on_state, updated_at) VALUES (${key}, ${!!on}, now())
              ON CONFLICT (key) DO UPDATE SET on_state = ${!!on}, updated_at = now()`;
}

module.exports = { DEFAULTS, getFlag, setFlag };
