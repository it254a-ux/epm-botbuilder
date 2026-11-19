// Database client (Turso, a hosted SQLite). getDb() returns a function used as  sql`SELECT ... ${value}`  that resolves to
// an array of row objects, the same shape the old Postgres driver gave, so the rest of the app did not change.
// Queries are written in Postgres style and translated in sql-turso.js.
//
// Vercel settings:  TURSO_DATABASE_URL (libsql://...)   TURSO_AUTH_TOKEN
// The tables are created automatically the first time the server connects (checked by the newest table, free_bots) to an empty database.
const { buildQuery, shapeRow, splitStatements, translateSql } = require('./sql-turso');
const SCHEMA = require('./schema-text');

let sql;
let clientRef;
let ready;

/** A Postgres address (DATABASE_URL=postgres://...), or null. When set it takes priority over Turso. */
function postgresUrl(env = process.env) {
    const d = env.DATABASE_URL;
    return d && /^postgres(ql)?:\/\//i.test(d) ? d : null;
}

/** The address of the database, or null when none is set. */
function databaseUrl(env = process.env) {
    const p = postgresUrl(env);
    if (p) return p;
    const t = env.TURSO_DATABASE_URL;
    if (t) return t;
    const d = env.DATABASE_URL;
    if (d && /^(libsql|https?|file|wss?):/i.test(d)) return d;
    return null;
}

function connect(env = process.env) {
    const url = databaseUrl(env);
    if (!url) {
        // Names only, never values: shows whether the host passed the settings to the server at all.
        const names = Object.keys(env).filter(k => /^(TURSO|DATABASE_URL|ADMIN_PASSWORD)/.test(k));
        throw new Error(
            'TURSO_DATABASE_URL is not set in environment variables (and TURSO_AUTH_TOKEN for a hosted database). ' +
                `[Server can see ${names.length ? names.join(', ') : 'none of the Turso/admin settings'}; ${Object.keys(env).length} settings in total]`
        );
    }
    const local = /^file:/i.test(url);
    // On Vercel use the plain web client (no native code) over https; local files (tests) need the full client.
    const { createClient } = local ? require('@libsql/client') : require('@libsql/client/web');
    return createClient({ url: local ? url : url.replace(/^libsql:/i, 'https:'), authToken: env.TURSO_AUTH_TOKEN || undefined });
}

/** Creates the tables the first time (one cheap check on each cold start). Safe to run again. */
async function ensureSchema(client) {
    const have = await client.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'free_bots' LIMIT 1");
    if (have.rows.length) return;
    for (const stmt of splitStatements(SCHEMA)) {
        try {
            await client.execute(translateSql(stmt));
        } catch (err) {
            // "ALTER TABLE ... ADD COLUMN" for a column the table already has is fine
            if (!/duplicate column/i.test(err.message)) throw err;
        }
    }
}

/** Postgres (Aiven, Neon, ...). Queries are already Postgres style, so they run as written. On Cloudflare the
 *  'postgres' package resolves to its Workers build (workerd condition), which opens the connection over TCP. */
function getPostgres(url) {
    const postgres = require('postgres');
    const pg = (postgres.default || postgres)(url, { ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 15 });
    clientRef = { close: () => pg.end({ timeout: 1 }) };
    const schemaReady = async () => {
        const have = await pg`SELECT to_regclass('public.free_bots') AS t`;
        if (have[0] && have[0].t) return;
        await pg.unsafe(SCHEMA);
    };
    ready = schemaReady().catch(err => {
        ready = null;
        throw err;
    });
    return async (strings, ...values) => {
        if (!ready) ready = schemaReady();
        await ready;
        return pg(strings, ...values);
    };
}

function getDb() {
    if (!sql && postgresUrl()) {
        sql = getPostgres(postgresUrl());
    }
    if (!sql) {
        const client = connect();
        clientRef = client;
        ready = ensureSchema(client).catch(err => {
            ready = null; // try again on the next query
            throw err;
        });
        sql = async (strings, ...values) => {
            if (!ready) ready = ensureSchema(client);
            await ready;
            const { sql: text, args } = buildQuery(strings, values);
            // ADD COLUMN for a column that exists is not an error for the app
            try {
                const res = await client.execute({ sql: text, args });
                return res.rows.map(r => shapeRow(res.columns, r));
            } catch (err) {
                if (/^\s*ALTER\s+TABLE[\s\S]*ADD\s+COLUMN/i.test(text) && /duplicate column/i.test(err.message)) return [];
                throw err;
            }
        };
    }
    return sql;
}

/** True when a database address is set (used to choose between the database and in-memory fallbacks). */
function dbConfigured(env = process.env) {
    return Boolean(databaseUrl(env));
}

/** Test helper: forget the connection. */
function resetDb() {
    try { clientRef && clientRef.close(); } catch { /* ignore */ }
    sql = undefined;
    clientRef = undefined;
    ready = undefined;
}

module.exports = { getDb, dbConfigured, databaseUrl, resetDb };
