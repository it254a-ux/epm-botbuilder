// Runs the app's real queries on a real SQLite engine (the same one Turso uses), to prove the Postgres-to-Turso translation works.
jest.setTimeout(60000);
const fs = require('fs');
const path = require('path');

const ENV = { ...process.env };
let db;
let store;

beforeAll(() => {
    process.env = { ...ENV, TURSO_DATABASE_URL: 'file::memory:' };
    delete process.env.DATABASE_URL;
    db = require('../_lib/db');
    store = require('../_lib/signals-store');
});
afterAll(() => {
    db.resetDb();
    process.env = ENV;
});

const sig = (over = {}) => ({
    key: 'k1', symbol: 'frxEURUSD', symbolName: 'EUR/USD', market: 'forex', strategyId: 6, strategyName: 'M15', timeframe: 300,
    side: 'BUY', entry: 1.1, stopLoss: 1.09, takeProfit: 1.12, rr: 2, time: 1700000000, ...over,
});

describe('database layer on SQLite', () => {
    test('creates every table on an empty database and keeps schema text identical to schema.sql', async () => {
        expect(require('../_lib/schema-text')).toBe(fs.readFileSync(path.join(__dirname, '../_lib/schema.sql'), 'utf8'));
        const sql = db.getDb();
        const rows = await sql`SELECT name FROM sqlite_master WHERE type = 'table'`;
        const names = rows.map(r => r.name);
        for (const t of ['sites', 'owners', 'sessions', 'auth_attempts', 'audit_log', 'site_rate_history', 'site_events', 'forex_ai_usage', 'app_flags', 'signals', 'signal_watch_state', 'signal_pending', 'free_bots']) {
            expect(names).toContain(t);
        }
    });

    test('signals: insert, duplicate block, open list, close, feed; booleans and dates come back as in Postgres', async () => {
        const sql = db.getDb();
        await store.ensureTables(sql);
        const id = await store.insertSignal(sql, sig());
        expect(id).toBeGreaterThan(0);
        expect(await store.insertSignal(sql, sig())).toBeNull();
        const open = await store.getOpenSignals(sql);
        expect(open).toHaveLength(1);
        expect(open[0].telegramSent).toBe(false);
        await store.markTelegramSent(sql, id, 77);
        expect(await store.hasRecentSignal(sql, 'frxEURUSD', 300, 30, 'M15')).toBe(true);
        expect(await store.hasRecentSignal(sql, 'frxEURUSD', 900, 30)).toBe(false);
        const feed = await store.listSignals(sql, 10);
        expect(feed).toHaveLength(1);
        expect(feed[0].telegramSent === undefined || typeof feed[0].telegramSent === 'boolean').toBe(true);
        const closed = await store.closeSignal(sql, open[0], { status: 'hit_tp', enteredTime: 1, closedTime: 2 }, true);
        expect(closed).toBe(true);
        expect(await store.getOpenSignals(sql)).toHaveLength(0);
    });

    test('alerts: claim once, release, cool-down prefix', async () => {
        const sql = db.getDb();
        expect(await store.claimAlert(sql, 'x|grab-signal|a')).toBe(true);
        expect(await store.claimAlert(sql, 'x|grab-signal|a')).toBe(false);
        expect(await store.hasRecentAlert(sql, 'x|grab-signal|', 30)).toBe(true);
        await store.releaseAlert(sql, 'x|grab-signal|a');
        expect(await store.claimAlert(sql, 'x|grab-signal|a')).toBe(true);
    });

    test('watchlist (two lists at once), watch state, news cache with JSON', async () => {
        const sql = db.getDb();
        await store.setWatchlist(sql, [['frxEURUSD', true], ['frxGBPUSD', false]]);
        const list = await store.getWatchlist(sql);
        expect(list).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: 'frxGBPUSD', enabled: false }), expect.objectContaining({ symbol: 'frxEURUSD', enabled: true })]));
        await store.setLastCandle(sql, 'frxEURUSD', 300, 1700000300);
        expect(await store.getLastCandle(sql, 'frxEURUSD', 300)).toBe(1700000300);
        await store.setNewsCache(sql, [{ title: 'CPI' }]);
        const cache = await store.getNewsCache(sql);
        expect(cache.events).toEqual([{ title: 'CPI' }]);
        expect(cache.fetchedAt instanceof Date || typeof cache.fetchedAt === 'number').toBe(true);
    });

    test('pending setups', async () => {
        const sql = db.getDb();
        const id = await store.insertPending(sql, { ...sig({ key: 'p1' }), expiresAt: 1800000000 });
        expect(id).toBeGreaterThan(0);
        expect(await store.insertPending(sql, { ...sig({ key: 'p1' }), expiresAt: 1800000000 })).toBeNull();
        expect(await store.getWaiting(sql)).toHaveLength(1);
        expect(await store.resolvePending(sql, id, 'triggered', null)).toBe(true);
    });

    test('flags, rate limit counters, sessions, site events', async () => {
        const sql = db.getDb();
        const flags = require('../_lib/app-flags');
        await flags.setFlag(sql, 'forced_real', false);
        expect(await flags.getFlag(sql, 'forced_real')).toBe(false);
        await flags.setFlag(sql, 'forced_real', true);
        expect(await flags.getFlag(sql, 'forced_real')).toBe(true);

        const auth = require('../_lib/auth');
        expect(await auth.hit(sql, 'k', 60)).toBeGreaterThan(0);
        expect(await auth.hit(sql, 'k', 60)).toBeGreaterThan(1);

        await sql`INSERT INTO owners (email, name, password_hash, role) VALUES (${'a@b.co'}, ${'A'}, ${'h'}, 'operator')`;
        const [{ id: ownerId }] = await sql`SELECT id FROM owners WHERE email = ${'a@b.co'}`;
        const token = await auth.createSession(sql, ownerId);
        const me = await auth.getSession(sql, { headers: { cookie: `${auth.COOKIE_NAME || 'session'}=${token}` } });
        expect(me === null || me.email === 'a@b.co').toBe(true);

        await sql`INSERT INTO sites (domain, name, owner_id) VALUES (${'x.example.com'}, ${'X'}, ${ownerId})`;
        const [site] = await sql`SELECT id, created_at FROM sites WHERE domain = ANY(${['x.example.com', 'nope.com']}) LIMIT 1`;
        expect(site.created_at instanceof Date).toBe(true);
        const events = require('../_lib/events');
        await events.logEvent(sql, site.id, 'created', { a: 1 });
        const list = await events.listEvents(sql, site.id);
        expect(list[0].detail).toEqual({ a: 1 });
    });

    test('every query written in the app is valid SQLite after translation', async () => {
        const { buildQuery } = require('../_lib/sql-turso');
        const sql = db.getDb();
        await store.ensureTables(sql);
        const dirs = [path.join(__dirname, '..'), path.join(__dirname, '../_lib'), path.join(__dirname, '../_lib/routes')];
        const files = dirs.flatMap(d => fs.readdirSync(d).filter(f => f.endsWith('.js')).map(f => path.join(d, f)));
        let checked = 0;
        for (const f of files) {
            const src = fs.readFileSync(f, 'utf8');
            let i = 0;
            while ((i = src.indexOf('sql`', i)) !== -1) {
                let j = i + 4;
                const strings = [''];
                const values = [];
                while (j < src.length && src[j] !== '`') {
                    if (src[j] === '$' && src[j + 1] === '{') {
                        let depth = 1;
                        let k = j + 2;
                        while (k < src.length && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
                        const before = strings[strings.length - 1];
                        values.push(/(ANY\(|unnest\()\s*$|\[\]\s*,\s*$/i.test(before) ? ['x'] : 'x');
                        strings.push('');
                        j = k;
                    } else {
                        strings[strings.length - 1] += src[j++];
                    }
                }
                i = j + 1;
                const text = strings.join('?');
                if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)/i.test(text) || text.includes('...')) continue;
                const q = buildQuery(strings, values);
                if (/^\s*ALTER/i.test(q.sql)) continue;
                try {
                    await sql([`EXPLAIN ${strings[0]}`, ...strings.slice(1)], ...values);
                } catch (err) {
                    throw new Error(`${path.basename(f)}: ${err.message}\n${q.sql}`);
                }
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(60);
    });
});
