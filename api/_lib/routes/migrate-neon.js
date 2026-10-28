// One-time copy of the old Neon data into Turso. Protected by SIGNALS_SECRET (?key=...).
//   /api/migrate-neon?key=SECRET&dry=1   only counts what is waiting in Neon (copies nothing)
//   /api/migrate-neon?key=SECRET         copies it (safe to run again: existing rows are kept)
// Needs the OLD Postgres address in Vercel: NEON_DATABASE_URL, or the old DATABASE_URL (postgres://...).
const { authorised } = require('../signals-auth');
const { getDb } = require('../db');
const { migrate, TABLES } = require('../migrate-neon');

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorised(req)) { res.status(401).json({ error: 'Unauthorised' }); return; }
    const old = process.env.NEON_DATABASE_URL || (/^postgres(ql)?:/i.test(process.env.DATABASE_URL || '') ? process.env.DATABASE_URL : '');
    if (!old) {
        res.status(400).json({ ok: false, error: 'The old Neon address is not set. Keep the old DATABASE_URL (postgres://...) in Vercel, or add it as NEON_DATABASE_URL.' });
        return;
    }
    const dry = (req.query || {}).dry === '1';
    try {
        const { neon } = require('@neondatabase/serverless');
        const neonSql = neon(old);
        const allowed = new Set(TABLES.map(t => t.name));
        const read = async table => {
            if (!allowed.has(table)) throw new Error('not allowed');
            const text = `SELECT * FROM ${table}`;
            const strings = [text];
            strings.raw = [text];
            return neonSql(strings);
        };
        const report = await migrate({ read, sql: getDb(), dry });
        res.status(200).json({ ok: !report.some(r => r.error), dry, tables: report });
    } catch (err) {
        console.error('migrate-neon failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
};
