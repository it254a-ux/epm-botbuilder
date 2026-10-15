// Tiny Deriv WebSocket client for the server-side signal watcher.
// Uses the PUBLIC endpoint (no login needed): market data only.
// Node 22+ has WebSocket built in, so no extra package is required.

const DEFAULT_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
const REQUEST_TIMEOUT_MS = 15000;

function connect(url = process.env.DERIV_WS_URL || DEFAULT_URL, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        if (typeof WebSocket === 'undefined') {
            reject(new Error('This Node version has no built-in WebSocket (need Node 22 or newer)'));
            return;
        }
        const ws = new WebSocket(url);
        const pending = new Map();
        let nextId = 1;
        let opened = false;

        const timer = setTimeout(() => {
            if (!opened) {
                try { ws.close(); } catch (e) { /* ignore */ }
                reject(new Error('Timed out connecting to Deriv'));
            }
        }, timeoutMs);

        const failAll = err => {
            for (const p of pending.values()) {
                clearTimeout(p.timer);
                p.reject(err);
            }
            pending.clear();
        };

        ws.addEventListener('message', ev => {
            let msg;
            try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
            const p = pending.get(msg.req_id);
            if (!p) return;
            pending.delete(msg.req_id);
            clearTimeout(p.timer);
            if (msg.error) p.reject(new Error(`${msg.error.code || 'DerivError'}: ${msg.error.message || 'request failed'}`));
            else p.resolve(msg);
        });
        ws.addEventListener('close', () => failAll(new Error('Deriv connection closed')));
        ws.addEventListener('error', () => {
            if (!opened) {
                clearTimeout(timer);
                reject(new Error('Could not connect to Deriv'));
            }
        });
        ws.addEventListener('open', () => {
            opened = true;
            clearTimeout(timer);
            resolve({
                send(payload) {
                    return new Promise((res, rej) => {
                        const id = nextId++;
                        const t = setTimeout(() => {
                            pending.delete(id);
                            rej(new Error('Deriv did not answer in time'));
                        }, REQUEST_TIMEOUT_MS);
                        pending.set(id, { resolve: res, reject: rej, timer: t });
                        try { ws.send(JSON.stringify({ ...payload, req_id: id })); } catch (e) {
                            pending.delete(id);
                            clearTimeout(t);
                            rej(e);
                        }
                    });
                },
                close() { try { ws.close(); } catch (e) { /* ignore */ } },
            });
        });
    });
}

/** All markets Deriv currently offers, with open/suspended flags. */
async function getActiveSymbols(client) {
    const res = await client.send({ active_symbols: 'full' });
    return (res.active_symbols || []).filter(s => s.underlying_symbol);
}

/** Candles for one symbol, oldest first. Same request the chart page uses. */
async function getCandles(client, symbol, granularity, days = 15) {
    const count = Math.min(5000, Math.ceil((days * 86400) / granularity));
    const res = await client.send({
        ticks_history: symbol,
        style: 'candles',
        granularity,
        end: 'latest',
        count,
        adjust_start_time: 1,
    });
    return (res.candles || []).map(c => ({
        time: c.epoch,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
    }));
}

/**
 * Long history for the backtest. Deriv returns a limited number of candles per request (at most
 * 5000, and possibly fewer), so older data is read page by page: each page ends just before the
 * oldest candle of the previous one, and reading stops only when a page brings nothing new.
 * Returns candles oldest first, no duplicates. `stats` (optional) is filled with what happened.
 */
async function getCandlesBack(client, symbol, granularity, days, stats = {}) {
    const PAGE = 5000;
    const MAX_PAGES = 30;
    const wanted = Math.ceil((days * 86400) / granularity);
    const byTime = new Map();
    stats.pages = 0;
    stats.wanted = wanted;
    stats.perPage = [];
    let end = 'latest';
    for (let page = 0; page < MAX_PAGES && byTime.size < wanted; page++) {
        const count = Math.min(PAGE, wanted - byTime.size);
        const res = await client.send({ ticks_history: symbol, style: 'candles', granularity, end, count });
        const rows = (res.candles || []).map(c => ({ time: c.epoch, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) }));
        stats.pages++;
        stats.perPage.push(rows.length);
        if (!rows.length) break;
        const before = byTime.size;
        for (const r of rows) byTime.set(r.time, r);
        if (byTime.size === before) break; // nothing older came back: that is all the history there is
        end = Math.min(...rows.map(r => r.time)) - 1;
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
}

module.exports = { connect, getActiveSymbols, getCandles, getCandlesBack, DEFAULT_URL };
