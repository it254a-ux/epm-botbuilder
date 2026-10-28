// Turns the app's Postgres-style queries into SQLite (Turso) queries. Pure functions, no network.
// The app's queries are written once, in Postgres style (the tests run them on a real Postgres engine);
// this file makes the very same text run on Turso, so no query has to be rewritten by hand.
//
// Times are stored as ISO text ("2026-10-28T08:41:00.000Z"): it sorts correctly and reads back as a Date.

const FMT = '%Y-%m-%dT%H:%M:%fZ';
const NOW = `strftime('${FMT}','now')`;
const UNITS = { second: 'seconds', minute: 'minutes', hour: 'hours', day: 'days' };
const unitName = u => UNITS[String(u).toLowerCase().replace(/s$/, '')] || String(u);

/** Postgres query text (with ? where each value goes) -> SQLite text. */
function translateSql(text) {
    let q = text;
    // table definitions
    q = q.replace(/\bBIGSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    q = q.replace(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    q = q.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT').replace(/\bJSONB\b/gi, 'TEXT').replace(/\bDOUBLE\s+PRECISION\b/gi, 'REAL');
    q = q.replace(/\bDEFAULT\s+now\(\)/gi, `DEFAULT (${NOW})`);
    q = q.replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN');
    // casts: ?::int, ::jsonb, ::text[] ...
    q = q.replace(/::\s*[a-z_]+(\s*\[\])?/gi, '');
    // times: now() +/- (? * interval '1 minute')  and  now() +/- interval '3 hours'
    q = q.replace(/now\(\)\s*([-+])\s*\(\s*\?\s*\*\s*interval\s*'1\s*([a-z]+)'\s*\)/gi, (_, sign, u) => `strftime('${FMT}','now','${sign}'||(?)||' ${unitName(u)}')`);
    q = q.replace(/now\(\)\s*([-+])\s*interval\s*'(\d+)\s*([a-z]+)'/gi, (_, sign, n, u) => `strftime('${FMT}','now','${sign}${n} ${unitName(u)}')`);
    q = q.replace(/\bnow\(\)/gi, NOW);
    return q;
}

/** A value from the app -> a value Turso accepts. */
function toArg(v) {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
}

/**
 * Tagged-template pieces -> { sql, args } for Turso.
 *   - every ${value} becomes ?
 *   - "= ANY(${list})" becomes "IN (?, ?, ...)"
 *   - "unnest(${a}, ${b})" (two lists side by side) becomes a join of two JSON lists
 */
function buildQuery(strings, values) {
    let text = '';
    const args = [];
    for (let i = 0; i < strings.length; i++) {
        let part = strings[i];
        if (i >= values.length) { text += part; break; }
        const v = values[i];
        if (Array.isArray(v) && /=\s*ANY\(\s*$/i.test(part)) {
            part = part.replace(/=\s*ANY\(\s*$/i, 'IN (');
            text += part + (v.length ? v.map(() => '?').join(', ') : 'NULL');
            v.forEach(x => args.push(toArg(x)));
            // the closing ")" of ANY( ... ) is already in the next piece
            continue;
        }
        if (Array.isArray(v)) {
            // a list passed to unnest(...): sent as JSON text, expanded by json_each below
            args.push(JSON.stringify(v));
            text += part + '?';
            continue;
        }
        args.push(toArg(v));
        text += part + '?';
    }
    text = text.replace(
        /unnest\(\s*\?\s*(?:::\s*\w+\s*\[\s*\]\s*)?,\s*\?\s*(?:::\s*\w+\s*\[\s*\]\s*)?\)/gi,
        '(SELECT a.value AS c1, b.value AS c2 FROM json_each(?) a JOIN json_each(?) b ON a.key = b.key)'
    );
    // SQLite needs WHERE true between "INSERT ... SELECT ..." and "ON CONFLICT"
    text = text.replace(/(\bjson_each\(\?\) b ON a\.key = b\.key\))\s+(ON\s+CONFLICT)/i, '$1 WHERE true $2');
    return { sql: translateSql(text), args };
}

const BOOL_COLUMNS = new Set(['disabled', 'telegram_sent', 'result_sent', 'on_state', 'enabled']);
const JSON_COLUMNS = new Set(['detail', 'events']);
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

/** One row from Turso -> the same kind of object the Postgres driver gave (Date for times, true/false, parsed JSON). */
function shapeRow(columns, row) {
    const out = {};
    columns.forEach((c, i) => {
        let v = row[i];
        if (BOOL_COLUMNS.has(c) && (v === 0 || v === 1)) v = v === 1;
        else if (typeof v === 'string' && /(_at|_start|_from)$/.test(c) && ISO.test(v)) v = new Date(v);
        else if (typeof v === 'string' && JSON_COLUMNS.has(c)) {
            try { v = JSON.parse(v); } catch { /* keep the text */ }
        }
        out[c] = v;
    });
    return out;
}

/** Splits a script into single statements (the schema has no semicolons inside text). Drops comments. */
function splitStatements(script) {
    return script
        .split('\n')
        .map(l => l.replace(/--.*$/, ''))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
}

module.exports = { FMT, NOW, translateSql, toArg, buildQuery, shapeRow, splitStatements };
