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

// The list of accounts shown as "Real Account". Until the admin changes it, it is the one account used so far.
const DEFAULT_ACCOUNTS = ['DOT94283012'];
const ACCOUNT_RE = /^[A-Za-z]{2,6}\d{3,12}$/;

const cleanAccounts = list => {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(x => {
        const id = String(x || '').trim().toUpperCase();
        if (ACCOUNT_RE.test(id) && !out.includes(id)) out.push(id);
    });
    return out.slice(0, 50);
};

let valuesReady = false;
async function ensureValues(sql) {
    if (valuesReady) return;
    await sql`CREATE TABLE IF NOT EXISTS app_values (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    valuesReady = true;
}

async function getAccounts(sql) {
    await ensureValues(sql);
    const rows = await sql`SELECT value FROM app_values WHERE key = 'forced_real_accounts' LIMIT 1`;
    if (!rows.length) return DEFAULT_ACCOUNTS.slice();
    try {
        return cleanAccounts(JSON.parse(rows[0].value));
    } catch (err) {
        return DEFAULT_ACCOUNTS.slice();
    }
}

async function setAccounts(sql, list) {
    const accounts = cleanAccounts(list);
    await ensureValues(sql);
    const value = JSON.stringify(accounts);
    await sql`INSERT INTO app_values (key, value, updated_at) VALUES ('forced_real_accounts', ${value}, now())
              ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()`;
    return accounts;
}

module.exports = { DEFAULTS, DEFAULT_ACCOUNTS, getFlag, setFlag, getAccounts, setAccounts, cleanAccounts };
