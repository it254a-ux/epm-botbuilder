// Cloudflare Worker entry. It runs the existing Vercel-style handlers in /api  (handler(req, res))
// unchanged by giving them a small req/res adapter, and serves the built site from ./dist.

const SECRET_FREE_DEFAULTS = { FLAG_POLL_MS: '2500' }; // free plan allows 50 subrequests per request

// /api/<name>  ->  file in /api
const HANDLERS = {
    admin: () => import('../api/admin.js'),
    auth: () => import('../api/auth.js'),
    bots: () => import('../api/bots.js'),
    'forex-analyse': () => import('../api/forex-analyse.js'),
    'kronos-forecast': () => import('../api/kronos-forecast.js'),
    'my-site': () => import('../api/my-site.js'),
    'return-host': () => import('../api/return-host.js'),
    'signal-watch': () => import('../api/signal-watch.js'),
    'site-settings': () => import('../api/site-settings.js'),
};

// Same rewrites as vercel.json
const REWRITES = {
    '/api/signals': ['signal-watch', 'feed'],
    '/api/signal-admin': ['signal-watch', 'admin'],
    '/api/signal-backtest': ['signal-watch', 'backtest'],
    '/api/migrate-neon': ['signal-watch', 'migrate-neon'],
    '/api/signal-watch-mtf': ['signal-watch', 'watch-mtf'],
};

function applyEnv(env) {
    for (const [k, v] of Object.entries(env || {})) {
        if (typeof v === 'string') process.env[k] = v;
    }
    for (const [k, v] of Object.entries(SECRET_FREE_DEFAULTS)) {
        if (!process.env[k]) process.env[k] = v;
    }
}

async function readBody(request) {
    if (request.method === 'GET' || request.method === 'HEAD') return undefined;
    const type = (request.headers.get('content-type') || '').toLowerCase();
    const text = await request.text();
    if (!text) return type.includes('json') ? {} : undefined;
    if (type.includes('json')) {
        try { return JSON.parse(text); } catch { return {}; }
    }
    if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
    return text;
}

function makeReq(request, url, query, body) {
    const headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const ip = request.headers.get('cf-connecting-ip');
    if (ip && !headers['x-forwarded-for']) headers['x-forwarded-for'] = ip;
    return {
        method: request.method,
        url: url.pathname + url.search,
        headers,
        query,
        body,
        socket: { remoteAddress: ip || undefined },
        on(event, cb) {
            if (event === 'close') request.signal.addEventListener('abort', () => cb());
            return this;
        },
    };
}

/** Runs a Node-style handler and resolves with a Response (supports normal replies and streaming). */
function run(handler, req) {
    return new Promise((resolve, reject) => {
        const headers = new Headers();
        let status = 200;
        let sent = false;
        let writer = null;
        const enc = new TextEncoder();

        const setHeader = (name, value) => {
            headers.delete(name);
            if (Array.isArray(value)) value.forEach(v => headers.append(name, String(v)));
            else headers.set(name, String(value));
        };
        const toBytes = d => (typeof d === 'string' ? enc.encode(d) : d);

        const res = {
            get statusCode() { return status; },
            set statusCode(c) { status = c; },
            status(c) { status = c; return res; },
            setHeader,
            getHeader: n => headers.get(n),
            writeHead(c, h) {
                status = c;
                if (h) Object.entries(h).forEach(([k, v]) => setHeader(k, v));
                return res;
            },
            write(chunk) {
                if (!sent) {
                    sent = true;
                    const ts = new TransformStream();
                    writer = ts.writable.getWriter();
                    resolve(new Response(ts.readable, { status, headers }));
                }
                writer.write(toBytes(chunk));
                return true;
            },
            json(obj) {
                if (!headers.has('content-type')) headers.set('Content-Type', 'application/json; charset=utf-8');
                return res.end(JSON.stringify(obj));
            },
            send(data) {
                if (data !== null && typeof data === 'object' && !(data instanceof Uint8Array)) return res.json(data);
                return res.end(data);
            },
            end(data) {
                if (writer) {
                    if (data) writer.write(toBytes(data));
                    writer.close();
                    return res;
                }
                if (sent) return res;
                sent = true;
                const noBody = status === 204 || status === 304;
                resolve(new Response(noBody ? null : (data === undefined ? '' : data), { status, headers }));
                return res;
            },
        };

        Promise.resolve()
            .then(() => handler(req, res))
            .then(() => { if (!sent || writer) res.end(); })
            .catch(err => {
                console.error('Handler error:', err && err.stack ? err.stack : err);
                if (!sent) {
                    sent = true;
                    resolve(new Response(JSON.stringify({ error: 'Server error' }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' },
                    }));
                } else if (writer) {
                    try { writer.close(); } catch { /* ignore */ }
                } else {
                    reject(err);
                }
            });
    });
}

export default {
    async fetch(request, env, ctx) {
        applyEnv(env);
        const url = new URL(request.url);
        let path = url.pathname.replace(/\/+$/, '') || '/';

        // Admin / owner pages (vercel.json rewrites)
        if (path === '/owner' || path === '/admin') {
            const target = new URL(`${path}/index.html`, url);
            return env.ASSETS.fetch(new Request(target, request));
        }

        if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

        const query = Object.fromEntries(url.searchParams);
        let name;
        if (REWRITES[path]) {
            const [file, route] = REWRITES[path];
            name = file;
            query.route = route;
        } else {
            name = path.slice('/api/'.length).split('/')[0];
        }

        // api/_lib/bot-template.js in the repo is a React component, not the bot XML template that
        // generate-bot.js needs (fillBotTemplate does not exist), so this route could not work on
        // Vercel either. Answer clearly instead of crashing, until the real template is added.
        if (name === 'generate-bot') {
            return new Response(JSON.stringify({ error: 'AI bot generator is not set up yet' }), {
                status: 501,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const load = HANDLERS[name];
        if (!load) {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const mod = await load();
        const handler = mod.default && typeof mod.default === 'function' ? mod.default : mod;
        const body = await readBody(request);
        const req = makeReq(request, url, query, body);
        return run(handler, req);
    },
};
