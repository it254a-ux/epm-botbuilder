// Admin API for the watchlist (used by /signals-admin.html). Protected by SIGNALS_SECRET.
//
//   GET   -> every market Deriv offers, with open/closed and whether it is switched on
//   POST  -> body { "symbols": { "frxEURUSD": true, "frxGBPUSD": false, ... } } saves the switches
const { getDb } = require('../db');
const deriv = require('../deriv');
const core = require('../signals-core');
const store = require('../signals-store');
const { authorised } = require('../signals-auth');

const SYMBOL_OK = /^[A-Za-z0-9_]{1,40}$/;
const MAX_ENTRIES = 500;

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    if (!authorised(req)) {
        res.status(401).json({ error: 'Unauthorised' });
        return;
    }

    try {
        const sql = getDb();
        await store.ensureTables(sql);

        if (req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') {
                try { body = JSON.parse(body); } catch (e) { body = null; }
            }
            const map = body && body.symbols;
            if (!map || typeof map !== 'object' || Array.isArray(map)) {
                res.status(400).json({ error: 'Send {"symbols": {"frxEURUSD": true, ...}}' });
                return;
            }
            const entries = Object.entries(map);
            if (entries.length === 0 || entries.length > MAX_ENTRIES || entries.some(([s, v]) => !SYMBOL_OK.test(s) || typeof v !== 'boolean')) {
                res.status(400).json({ error: `Between 1 and ${MAX_ENTRIES} markets, each true or false` });
                return;
            }
            await store.setWatchlist(sql, entries);
            const rows = await store.getWatchlist(sql);
            res.status(200).json({ ok: true, saved: entries.length, enabled: rows.filter(r => r.enabled).length });
            return;
        }

        // GET
        const rows = await store.getWatchlist(sql);
        const fromEnv = rows.length === 0;
        const on = new Set(fromEnv ? core.readConfig().symbols : rows.filter(r => r.enabled).map(r => r.symbol));

        let active = [];
        let derivError = null;
        let client = null;
        try {
            client = await deriv.connect();
            active = await deriv.getActiveSymbols(client);
        } catch (err) {
            derivError = err.message;
        } finally {
            if (client) client.close();
        }

        const markets = active.map(s => ({
            symbol: s.underlying_symbol,
            name: s.underlying_symbol_name,
            market: s.market,
            marketName: s.market_display_name || s.market,
            submarket: s.submarket_display_name || '',
            open: s.exchange_is_open !== 0 && s.is_trading_suspended !== 1,
            enabled: on.has(s.underlying_symbol),
        }));
        res.status(200).json({ source: fromEnv ? 'environment' : 'database', enabled: on.size, main: core.readConfig().priority, markets, derivError });
    } catch (err) {
        console.error('signal-admin error:', err.message);
        res.status(500).json({ error: 'Could not complete the request' });
    }
};
