// Market Forecast: starts a forecast on the Kronos service (POST) and lets the page check on it (GET ?id=...).
// A forecast can take minutes on a normal laptop, longer than a Vercel function may wait, so it works in two short steps.
//
// Kronos (https://github.com/shiyu-coder/Kronos) is a Python/PyTorch model, so it cannot run inside a Vercel
// function. It runs as its own small service (Kronos fork, forecast_service/app.py) and this file is the only
// thing that talks to it. The address and the key live in Vercel -> Settings -> Environment Variables:
//   KRONOS_URL     the service address, e.g. https://your-name.ngrok-free.dev   (no trailing path)
//   KRONOS_SECRET  the same secret the service was started with (sent as X-API-Key, never shown to visitors)
// If the service is off (for example the laptop it runs on is switched off) visitors just get "offline".
//
// Plain CommonJS, same as the other api/ files. Do not add a second file like this to api/ without checking
// api/__tests__/function-count.spec.js (Vercel's free plan allows 12 functions).

const MIN_CANDLES = 64;
const MAX_CANDLES = 512;
const TIMEOUT_MS = 20_000; // each step is short; the long work happens on the service

// ---- small per-instance limits so the public cannot hammer the machine the model runs on
const PER_MINUTE = Number(process.env.KRONOS_PER_MINUTE) > 0 ? Number(process.env.KRONOS_PER_MINUTE) : 4;
const PER_DAY = Number(process.env.KRONOS_DAILY_CAP) > 0 ? Number(process.env.KRONOS_DAILY_CAP) : 400;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const hits = [];
function takeSlot(ip, now = Date.now()) {
    while (hits.length && now - hits[0].t > DAY) hits.shift();
    if (hits.filter(h => h.ip === ip && now - h.t < MINUTE).length >= PER_MINUTE) return 'minute';
    if (hits.length >= PER_DAY) return 'day';
    hits.push({ ip, t: now });
    return null;
}

const POLL_PER_MINUTE = 40;
const polls = [];
function takePoll(ip, now = Date.now()) {
    while (polls.length && now - polls[0].t > MINUTE) polls.shift();
    if (polls.filter(h => h.ip === ip).length >= POLL_PER_MINUTE) return false;
    polls.push({ ip, t: now });
    return true;
}

const finite = v => typeof v === 'number' && Number.isFinite(v);

/** Returns a clean candle list, or null if anything is wrong with it. */
function cleanCandles(list) {
    if (!Array.isArray(list) || list.length < MIN_CANDLES || list.length > MAX_CANDLES) return null;
    const out = [];
    let prev = -Infinity;
    for (const c of list) {
        if (!c || !finite(c.t) || !finite(c.o) || !finite(c.h) || !finite(c.l) || !finite(c.c)) return null;
        if (c.t <= prev) return null; // times must increase
        if (c.h < Math.max(c.o, c.c, c.l) || c.l > Math.min(c.o, c.c, c.h)) return null; // high/low must contain the candle
        prev = c.t;
        out.push({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c });
    }
    return out;
}

function cleanLevels(levels) {
    if (levels === undefined || levels === null) return { ok: true, value: undefined };
    if (typeof levels !== 'object') return { ok: false };
    const { side, tp, sl } = levels;
    if ((side !== 'buy' && side !== 'sell') || !finite(tp) || !finite(sl)) return { ok: false };
    if (side === 'buy' && !(tp > sl)) return { ok: false };
    if (side === 'sell' && !(tp < sl)) return { ok: false };
    return { ok: true, value: { side, tp, sl } };
}

const whole = (v, fallback, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : v === undefined ? fallback : null);

const JOB_ID = /^[0-9a-f]{32}$/;

function headersFor() {
    const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' };
    if (process.env.KRONOS_SECRET) headers['X-API-Key'] = process.env.KRONOS_SECRET;
    return headers;
}

/** Calls the service with a short time limit. Returns { r, data } or { offline: true } / { slow: true }. */
async function callService(path, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const base = process.env.KRONOS_URL.replace(/\/+$/, '');
        const r = await fetch(`${base}${path}`, { ...init, signal: controller.signal, headers: headersFor() });
        let data = null;
        try {
            data = await r.json();
        } catch {
            data = null; // not JSON: the tunnel answered with its own "nothing here" page
        }
        return { r, data };
    } catch (err) {
        if (err && err.name === 'AbortError') return { slow: true };
        console.error('kronos-forecast: could not reach the service');
        return { offline: true };
    } finally {
        clearTimeout(timer);
    }
}

const offline = res => res.status(502).json({ error: 'The forecast service is offline right now.', code: 'offline' });
const slow = res => res.status(504).json({ error: 'The forecast service is slow to answer. Please try again in a minute.', code: 'slow' });

module.exports = async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    if (!process.env.KRONOS_URL) {
        // Visitors get a plain message; the real reason goes to the server log only.
        console.error('kronos-forecast: KRONOS_URL is not set');
        res.status(503).json({ error: 'The forecast is not available right now.', code: 'offline' });
        return;
    }
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

    // ---- GET ?id=...  : how is the forecast doing?
    if (req.method === 'GET') {
        const id = String((req.query && req.query.id) || '');
        if (!JOB_ID.test(id)) {
            res.status(400).json({ error: 'Bad forecast request' });
            return;
        }
        if (!takePoll(ip)) {
            res.status(429).json({ error: 'Checking too often. Please wait a moment.' });
            return;
        }
        const out = await callService(`/jobs/${id}`, { method: 'GET' });
        if (out.offline) return offline(res);
        if (out.slow) return slow(res);
        const { r, data } = out;
        if (r.status === 404 && data && data.detail === 'unknown job') {
            // the service was restarted while the forecast was running
            res.status(410).json({ error: 'The forecast was lost because the service restarted. Please run it again.', code: 'lost' });
            return;
        }
        if (!r.ok || !data || !['running', 'done', 'error'].includes(data.status)) return offline(res);
        const body = { status: data.status, elapsed: data.elapsed };
        if (data.status === 'done') body.result = data.result;
        if (data.status === 'error') body.error = data.error;
        res.status(200).json(body);
        return;
    }

    // ---- POST : start a forecast
    const refused = takeSlot(ip);
    if (refused) {
        res.status(429).json({
            error: refused === 'minute' ? 'Too many forecasts. Please wait a minute and try again.' : 'The forecast has reached its limit for today. Please try again tomorrow.',
        });
        return;
    }
    const body = req.body || {};
    const candles = cleanCandles(body.candles);
    const predLen = whole(body.pred_len, 48, 1, 120);
    const paths = whole(body.paths, 6, 1, 12);
    const levels = cleanLevels(body.levels);
    if (!candles || predLen === null || paths === null || !levels.ok) {
        res.status(400).json({ error: 'Bad forecast request' });
        return;
    }
    const out = await callService('/jobs', {
        method: 'POST',
        body: JSON.stringify({ candles, pred_len: predLen, paths, levels: levels.value }),
    });
    if (out.offline) return offline(res);
    if (out.slow) return slow(res);
    const { r, data } = out;
    if (r.status === 429) {
        // the service only runs one forecast at a time; it is still busy with an earlier one
        res.status(429).json({ error: 'The model is still busy with another forecast. Please wait a minute and try again.', code: 'busy' });
        return;
    }
    if (!r.ok || !data || typeof data.job !== 'string' || !JOB_ID.test(data.job)) {
        console.error('kronos-forecast: service answered', r.status);
        return offline(res);
    }
    res.status(200).json({ job: data.job });
};
module.exports.takeSlot = takeSlot;
module.exports.takePoll = takePoll;
