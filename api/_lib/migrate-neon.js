// One-time copy of the old Neon (Postgres) data into Turso. Nothing is deleted anywhere; rows that already exist in Turso
// (same id / same key) are left as they are, so running it twice is safe.
//
// Copied: accounts, sites, site history, free bots, admin switches, signal watchlist and signal history.
// Not copied (they refill by themselves): sessions (people just log in again), rate-limit counters, AI usage counters,
// news cache, waiting setups and alert markers.

// order matters: owners and sites come before the tables that point at them
const TABLES = [
    { name: 'owners', key: 'id' },
    { name: 'sites', key: 'id' },
    { name: 'site_rate_history', key: 'id' },
    { name: 'site_events', key: 'id' },
    { name: 'audit_log', key: 'id' },
    { name: 'free_bots', key: 'id' },
    { name: 'app_flags', key: 'key' },
    { name: 'signal_watchlist', key: 'symbol' },
    { name: 'signals', key: 'id' },
];

/** SQLite column type for a value found in Neon. */
function columnType(v) {
    if (typeof v === 'number') return 'NUMERIC';
    if (typeof v === 'boolean') return 'INTEGER';
    return 'TEXT';
}

const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

/** A value read from Postgres -> a value Turso accepts. */
function toValue(v) {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'object') return JSON.stringify(v); // jsonb
    return v;
}

/**
 * @param {object} o
 * @param {(table: string) => Promise<object[]>} o.read   rows of one table from Neon
 * @param {Function} o.sql                                  Turso tagged-template client (getDb())
 * @param {boolean} [o.dry]                                 only count, copy nothing
 */
async function migrate({ read, sql, dry = false }) {
    const report = [];
    for (const t of TABLES) {
        const entry = { table: t.name, found: 0, copied: 0, alreadyThere: 0 };
        report.push(entry);
        let rows;
        try {
            rows = await read(t.name);
        } catch (err) {
            entry.error = `could not read from Neon: ${err.message}`;
            continue;
        }
        entry.found = rows.length;
        if (dry) continue;
        // columns that exist in Neon but not in Turso (added by hand in the past) are added to Turso first, so no data is dropped
        try {
            const have = new Set((await sql(['SELECT name FROM pragma_table_info(\'' + t.name + '\')'])).map(r => r.name));
            const wanted = new Map();
            for (const row of rows) {
                for (const c of Object.keys(row)) {
                    if (!SAFE_NAME.test(c) || have.has(c)) continue;
                    const v = row[c];
                    if (!wanted.has(c) || (wanted.get(c) === 'TEXT' && v !== null && v !== undefined)) wanted.set(c, columnType(v));
                }
            }
            for (const [c, type] of wanted) {
                await sql([`ALTER TABLE ${t.name} ADD COLUMN ${c} ${type}`]);
                (entry.addedColumns = entry.addedColumns || []).push(c);
            }
        } catch (err) {
            entry.error = `could not add missing columns: ${err.message}`;
            continue;
        }
        for (const row of rows) {
            const cols = Object.keys(row).filter(c => SAFE_NAME.test(c));
            if (!cols.length) continue;
            const parts = [`INSERT OR IGNORE INTO ${t.name} (${cols.join(', ')}) VALUES (`];
            for (let i = 1; i < cols.length; i++) parts.push(', ');
            parts.push(') RETURNING 1 AS ok');
            try {
                const res = await sql(parts, ...cols.map(c => toValue(row[c])));
                if (res.length) entry.copied++;
                else {
                    // ignored: either the row is already there, or a rule (unique / required column) refused it
                    const there = await sql([`SELECT 1 AS ok FROM ${t.name} WHERE ${t.key} = `, ' LIMIT 1'], toValue(row[t.key]));
                    if (there.length) entry.alreadyThere++;
                    else (entry.refused = entry.refused || []).push(row[t.key]);
                }
            } catch (err) {
                entry.error = `${err.message} (row ${row[t.key]})`;
                break;
            }
        }
    }
    return report;
}

module.exports = { migrate, toValue, columnType, TABLES };
