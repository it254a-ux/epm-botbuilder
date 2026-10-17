// GET /api/signals?limit=50
// Public, read-only feed for the website's Signals page. Signals are written only by
// api/signal-watch.js (which is protected by SIGNALS_SECRET), never through this endpoint.
const { getDb } = require('../db');
const store = require('../signals-store');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const limit = Math.min(100, Math.max(1, parseInt((req.query && req.query.limit) || '50', 10) || 50));
    try {
        const sql = getDb();
        await store.ensureTables(sql);
        const signals = await store.listSignals(sql, limit);
        res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
        res.status(200).json({ signals });
    } catch (err) {
        console.error('signals feed error:', err);
        res.setHeader('Cache-Control', 'no-store');
        res.status(500).json({ error: 'Could not load signals' });
    }
};
