// Market Forecast: passes candles to the Kronos forecast service and returns its answer unchanged.
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
const TIMEOUT_MS = 55_000; // the function itself is limited to 60 s in vercel.json

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

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const base = process.env.KRONOS_URL;
    if (!base) {
        // Visitors get a plain message; the real reason goes to the server log only.
        console.error('kronos-forecast: KRONOS_URL is not set');
        res.status(503).json({ error: 'The forecast is not available right now.', code: 'offline' });
        return;
    }
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' };
        if (process.env.KRONOS_SECRET) headers['X-API-Key'] = process.env.KRONOS_SECRET;
        const r = await fetch(`${base.replace(/\/+$/, '')}/forecast`, {
            method: 'POST',
            signal: controller.signal,
            headers,
            body: JSON.stringify({ candles, pred_len: predLen, paths, levels: levels.value }),
        });
        let data = null;
        try {
            data = await r.json();
        } catch {
            data = null; // not JSON: the tunnel answered with its own "nothing here" page
        }
        if (!r.ok || !data || !Array.isArray(data.paths)) {
            console.error('kronos-forecast: service answered', r.status);
            res.status(502).json({ error: 'The forecast service is offline right now.', code: 'offline' });
            return;
        }
        res.status(200).json(data);
    } catch (err) {
        if (err && err.name === 'AbortError') {
            // the model is probably still loading (it downloads the first time); the service keeps working on it
            res.status(504).json({ error: 'The model is still warming up. Please try again in a minute.', code: 'slow' });
        } else {
            console.error('kronos-forecast: could not reach the service');
            res.status(502).json({ error: 'The forecast service is offline right now.', code: 'offline' });
        }
    } finally {
        clearTimeout(timer);
    }
};
module.exports.takeSlot = takeSlot;
