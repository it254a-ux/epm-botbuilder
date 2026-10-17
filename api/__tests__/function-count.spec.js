/** @jest-environment node */
// Guards the Vercel free (Hobby) plan limit: at most 12 serverless functions per deployment, and EVERY file directly
// inside api/ is one function. Going over it makes every deployment fail (this happened once already).
// New signal features go into api/_lib/routes/ and are reached through api/signal-watch.js, never as a new file in api/.
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../../vercel.json'), 'utf8'));
const functionFiles = () => fs.readdirSync(API, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(js|mjs|cjs|ts)$/.test(e.name) && !e.name.startsWith('_'))
    .map(e => e.name);

describe('Vercel function limit', () => {
    test('there are at most 11 serverless functions (the limit is 12: keep one spare)', () => {
        const files = functionFiles();
        expect(files.length).toBeLessThanOrEqual(11);
    });
    test('every function in vercel.json "functions" is a real file (a missing one breaks the deployment)', () => {
        for (const name of Object.keys(vercel.functions || {})) {
            expect(fs.existsSync(path.join(__dirname, '../..', name))).toBe(true);
        }
    });
});

describe('the signal endpoints behind api/signal-watch.js', () => {
    const source = fs.readFileSync(path.join(API, 'signal-watch.js'), 'utf8');
    const routes = { '/api/signals': 'feed', '/api/signal-admin': 'admin', '/api/signal-backtest': 'backtest', '/api/signal-watch-mtf': 'watch-mtf' };

    test('each old address is rewritten to its route, before the catch-all', () => {
        const rewrites = vercel.rewrites.map(r => r.source);
        const catchAll = rewrites.indexOf('/api/(.*)');
        for (const [address, route] of Object.entries(routes)) {
            const i = rewrites.indexOf(address);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(catchAll);
            expect(vercel.rewrites[i].destination).toBe(`/api/signal-watch?route=${route}`);
        }
    });
    test('each route exists in the dispatcher and its file exists', () => {
        for (const route of Object.values(routes)) {
            expect(source).toMatch(new RegExp(`['"]?${route}['"]?: \\(\\) => require\\('\\./_lib/routes/([a-z-]+)'\\)`));
        }
        for (const f of ['signals', 'signal-admin', 'signal-backtest', 'signal-watch-mtf']) {
            expect(fs.existsSync(path.join(API, '_lib/routes', `${f}.js`))).toBe(true);
        }
    });

    describe('the dispatcher', () => {
        const handler = require('../signal-watch');
        const call = (query, method = 'GET') => new Promise(resolve => {
            const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
            Promise.resolve(handler({ method, query, headers: {} }, res)).then(() => setTimeout(() => resolve({ status: res.code, body: null }), 50));
        });
        const ENV = { ...process.env };
        beforeEach(() => { delete process.env.SIGNALS_SECRET; });
        afterAll(() => { process.env = ENV; });

        test('an unknown route is a 404, including names that exist on every object', async () => {
            for (const route of ['nope', '__proto__', 'toString', 'constructor']) {
                expect((await call({ route })).status).toBe(404);
            }
        });
        test('no route = the hourly watcher (protected by the secret)', async () => {
            expect((await call({})).status).toBe(401);
            expect((await call({ route: '' })).status).toBe(401);
        });
        test('every route reaches its own handler', async () => {
            expect((await call({ route: 'feed' }, 'POST')).status).toBe(405); // the public feed only allows GET
            expect((await call({ route: 'admin' })).status).toBe(401);
            expect((await call({ route: 'backtest' })).status).toBe(401);
            expect((await call({ route: 'watch-mtf' })).status).toBe(401);
        });
    });
});
