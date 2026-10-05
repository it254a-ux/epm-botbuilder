/** @jest-environment node */
// Runs the REAL handlers against a real (in-memory) Postgres, so the SQL itself is tested.
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

jest.mock('../_lib/db', () => ({ getDb: () => global.__sql }));

const auth = require('../auth');
const mySite = require('../my-site');
const admin = require('../admin');
const returnHost = require('../return-host');
const { checkDomain } = require('../_lib/dns-check');
const siteSettings = require('../site-settings');
const { hashPassword } = require('../_lib/auth');

const HOST = 'epm.test';

async function makeSql() {
    const db = new PGlite();
    await db.exec(fs.readFileSync(path.join(__dirname, '../_lib/schema.sql'), 'utf8'));
    return async (strings, ...vals) => {
        let q = '';
        strings.forEach((s, i) => { q += s; if (i < vals.length) q += `$${i + 1}`; });
        return (await db.query(q, vals.map(v => (v === undefined ? null : v)))).rows;
    };
}

function call(handler, { method = 'GET', query = {}, body, cookie, host = HOST, origin, ip = '1.1.1.1' } = {}) {
    return new Promise(resolve => {
        const headers = { host, 'x-forwarded-for': ip };
        if (cookie) headers.cookie = cookie;
        if (origin) headers.origin = origin;
        const res = {
            code: 200, headers: {},
            setHeader(k, v) { this.headers[k] = v; },
            status(c) { this.code = c; return this; },
            json(b) { resolve({ status: this.code, body: b, headers: this.headers }); },
        };
        handler({ method, query, headers, body, socket: {} }, res);
    });
}
const cookieOf = r => (r.headers['Set-Cookie'] || '').split(';')[0];
const post = (h, action, body, extra = {}) => call(h, { method: 'POST', query: { action }, body, ...extra });

async function signup(email, ip) {
    const r = await post(auth, 'register', { email, name: 'Test User', password: 'correct horse battery', accept_terms: true }, { ip });
    expect(r.status).toBe(201);
    return cookieOf(r);
}

jest.setTimeout(60000);
beforeEach(async () => {
    global.__sql = await makeSql();
    process.env.PLATFORM_HOSTS = HOST;
    process.env.PLATFORM_ROOT_DOMAIN = HOST;
    delete process.env.REGISTRATION_CODE;
});

describe('accounts', () => {
    it('registers, signs in, and refuses weak/duplicate credentials', async () => {
        const r = await post(auth, 'register', { email: 'a@x.com', name: 'Al', password: 'short' });
        expect(r.status).toBe(400);
        const c = await signup('a@x.com', '2.2.2.2');
        expect(c).toMatch(/^epm_session=[0-9a-f]{64}$/);
        expect((await call(auth, { query: { action: 'me' }, cookie: c })).body.owner.email).toBe('a@x.com');
        expect((await post(auth, 'register', { email: 'a@x.com', name: 'Al', password: 'correct horse battery', accept_terms: true }, { ip: '3.3.3.3' })).status).toBe(409);
        expect((await post(auth, 'login', { email: 'a@x.com', password: 'wrong password!!' })).status).toBe(401);
        expect((await post(auth, 'login', { email: 'nobody@x.com', password: 'wrong password!!' })).status).toBe(401);
        expect((await post(auth, 'login', { email: 'a@x.com', password: 'correct horse battery' })).status).toBe(200);
    });

    it('cannot self-register as admin, and stores only a session hash', async () => {
        const r = await post(auth, 'register', { email: 'b@x.com', name: 'B B', password: 'correct horse battery', role: 'admin', accept_terms: true });
        expect(r.body.owner.role).toBe('operator');
        const rows = await global.__sql`SELECT token_hash FROM sessions`;
        expect(cookieOf(r)).not.toContain(rows[0].token_hash);
    });

    it('rate-limits repeated bad logins', async () => {
        await signup('c@x.com', '4.4.4.4');
        let last;
        for (let i = 0; i < 10; i++) last = await post(auth, 'login', { email: 'c@x.com', password: 'nope nope nope' }, { ip: `9.9.9.${i}` });
        expect(last.status).toBe(429);
    });

    it('blocks cross-site posts and answers 404 on operator domains', async () => {
        expect((await post(auth, 'register', { email: 'd@x.com', name: 'Dd', password: 'correct horse battery', accept_terms: true }, { origin: 'https://evil.com' })).status).toBe(403);
        expect((await post(auth, 'login', { email: 'd@x.com', password: 'x' }, { host: 'trade.alice.com' })).status).toBe(404);
    });
});

describe('sites and plans', () => {
    it('free site: live at once, 25% share, operator contacts ignored, platform support', async () => {
        const c = await signup('f@x.com', '5.5.5.5');
        const bad = await call(mySite, { method: 'POST', cookie: c, body: { name: 'Free Co', subdomain: 'admin' } });
        expect(bad.status).toBe(400);
        const r = await call(mySite, { method: 'POST', cookie: c, body: { name: 'Free Co', subdomain: 'Free-Co', whatsapp: '254700000009', about: 'We trade.' } });
        expect(r.status).toBe(201);
        expect(r.body.site).toMatchObject({ domain: `free-co.${HOST}`, plan: 'free', status: 'active', platform_share: 25, operator_share: 75, whatsapp: '' });
        const pub = await call(siteSettings, { host: `free-co.${HOST}` });
        expect(pub.body.kind).toBe('site');
        expect(pub.body.site).toMatchObject({ plan: 'free', powered_by: true, about: 'We trade.' });
        expect(pub.body.site.contacts).toEqual({ whatsapp: '', phone: '', email: '', telegram: '' });
        expect((await call(mySite, { method: 'POST', cookie: c, body: { name: 'Again', subdomain: 'another' } })).status).toBe(409);
    });

    it('free site: accepts the full address as well as just the name', async () => {
        const c = await signup('k@x.com', '6.1.1.1');
        const r = await call(mySite, { method: 'POST', cookie: c, body: { name: 'Julias', subdomain: `Julias.${HOST}` } });
        expect(r.status).toBe(201);
        expect(r.body.site.domain).toBe(`julias.${HOST}`);
    });

    it('custom domain: pending until approved, 15% share, own contacts', async () => {
        const c = await signup('g@x.com', '6.6.6.6');
        expect((await call(mySite, { method: 'POST', cookie: c, body: { name: 'Mine', custom_domain: 'epm.test' } })).status).toBe(400);
        const r = await call(mySite, { method: 'POST', cookie: c, body: { name: 'Mine', custom_domain: 'https://www.Trade.Mine.com/', whatsapp: '+254 700 000 010' } });
        expect(r.body.site).toMatchObject({ domain: 'trade.mine.com', plan: 'custom', status: 'pending', platform_share: 15, whatsapp: '254700000010' });
        expect((await call(siteSettings, { host: 'trade.mine.com' })).body).toEqual({ kind: 'unconfigured', reason: 'pending' });
    });

    it('operators can only change their own site, and never plan/status/rate', async () => {
        const a = await signup('h1@x.com', '7.7.7.1');
        const b = await signup('h2@x.com', '7.7.7.2');
        await call(mySite, { method: 'POST', cookie: a, body: { name: 'Site A', subdomain: 'site-a' } });
        await call(mySite, { method: 'POST', cookie: b, body: { name: 'Site B', subdomain: 'site-b' } });
        await call(mySite, { method: 'PUT', cookie: a, body: { name: 'A renamed', status: 'suspended', plan: 'custom', commission_rate_override: 0, domain: 'steal.com', owner_id: 2 } });
        const rows = await global.__sql`SELECT name, status, plan, domain, commission_rate_override FROM sites ORDER BY id`;
        expect(rows[0]).toMatchObject({ name: 'A renamed', status: 'active', plan: 'free', domain: `site-a.${HOST}`, commission_rate_override: null });
        expect(rows[1].name).toBe('Site B');
        expect((await call(mySite, {})).status).toBe(401);
    });
});

describe('admin', () => {
    async function adminCookie() {
        await global.__sql`INSERT INTO owners (email, name, password_hash, role) VALUES ('boss@x.com','Boss',${await hashPassword('boss passphrase 123')},'admin')`;
        const r = await post(auth, 'login', { email: 'boss@x.com', password: 'boss passphrase 123' });
        return cookieOf(r);
    }

    it('is closed to operators, to other domains, and when PLATFORM_HOSTS is unset', async () => {
        const op = await signup('i@x.com', '8.8.8.8');
        const boss = await adminCookie();
        expect((await call(admin, { cookie: op })).status).toBe(403);
        expect((await call(admin, {})).status).toBe(401);
        expect((await call(admin, { cookie: boss, host: 'trade.alice.com' })).status).toBe(404);
        delete process.env.PLATFORM_HOSTS;
        expect((await call(admin, { cookie: boss })).status).toBe(404);
        process.env.PLATFORM_HOSTS = HOST;
        expect((await call(admin, { cookie: boss })).status).toBe(200);
        expect((await call(admin, { method: 'POST', cookie: boss, origin: 'https://evil.com', body: { action: 'set_status', site_id: 1, status: 'active' } })).status).toBe(403);
    });

    it('deletes sites and operator accounts (never admins or yourself)', async () => {
        const boss = await adminCookie();
        const a = await signup('del1@x.com', '8.1.1.1');
        const b = await signup('del2@x.com', '8.1.1.2');
        const sa = (await call(mySite, { method: 'POST', cookie: a, body: { name: 'Gone Co', subdomain: 'gone-co' } })).body.site.id;
        await call(mySite, { method: 'POST', cookie: b, body: { name: 'Stay Co', subdomain: 'stay-co' } });

        // operators cannot call it
        expect((await call(admin, { method: 'POST', cookie: a, body: { action: 'delete_site', site_id: sa } })).status).toBe(403);

        expect((await call(admin, { method: 'POST', cookie: boss, body: { action: 'delete_site', site_id: sa } })).status).toBe(200);
        expect((await global.__sql`SELECT 1 FROM sites WHERE id = ${sa}`).length).toBe(0);
        expect((await global.__sql`SELECT 1 FROM site_rate_history WHERE site_id = ${sa}`).length).toBe(0);

        const bId = (await global.__sql`SELECT id FROM owners WHERE email = 'del2@x.com'`)[0].id;
        const r = await call(admin, { method: 'POST', cookie: boss, body: { action: 'delete_owner', owner_id: bId } });
        expect(r.body).toEqual({ ok: true, sites_removed: 1 });
        expect((await global.__sql`SELECT 1 FROM owners WHERE id = ${bId}`).length).toBe(0);
        expect((await global.__sql`SELECT 1 FROM sites`).length).toBe(0);
        expect((await call(auth, { query: { action: 'me' }, cookie: b })).body.owner).toBeNull();

        const bossId = (await global.__sql`SELECT id FROM owners WHERE role = 'admin'`)[0].id;
        expect((await call(admin, { method: 'POST', cookie: boss, body: { action: 'delete_owner', owner_id: bossId } })).status).toBe(400);
        const log = await global.__sql`SELECT action FROM audit_log WHERE action <> 'terms_accepted' ORDER BY id`;
        expect(log.map(l => l.action)).toEqual(['delete_site', 'delete_owner']);
    });

    it('return-host only approves active FREE sites under the root domain', async () => {
        const op = await signup('rh@x.com', '8.2.2.2');
        await call(mySite, { method: 'POST', cookie: op, body: { name: 'Bounce Co', subdomain: 'bounce-co' } });
        const ask = host => call(returnHost, { query: { host } });
        expect((await ask(`bounce-co.${HOST}`)).body).toEqual({ ok: true });
        expect((await ask(`nobody.${HOST}`)).body).toEqual({ ok: false });
        expect((await ask('evil.com')).body).toEqual({ ok: false });
        expect((await ask(`bounce-co.${HOST}.evil.com`)).body).toEqual({ ok: false });
        expect((await ask(HOST)).body).toEqual({ ok: false });
        await global.__sql`UPDATE sites SET status = 'suspended'`;
        expect((await ask(`bounce-co.${HOST}`)).body).toEqual({ ok: false });
        await global.__sql`UPDATE sites SET status = 'active', plan = 'custom'`;
        expect((await ask(`bounce-co.${HOST}`)).body).toEqual({ ok: false });
        expect((await call(returnHost, { query: { host: `bounce-co.${HOST}` }, host: 'trade.alice.com' })).status).toBe(404);
    });

    it('approves, suspends, upgrades with a dated rate change, and disables accounts', async () => {
        const boss = await adminCookie();
        const op = await signup('j@x.com', '8.8.4.4');
        const created = await call(mySite, { method: 'POST', cookie: op, body: { name: 'Jay', subdomain: 'jay' } });
        const id = created.body.site.id;

        await call(admin, { method: 'POST', cookie: boss, body: { action: 'set_status', site_id: id, status: 'suspended' } });
        expect((await call(siteSettings, { host: `jay.${HOST}` })).body).toEqual({ kind: 'unconfigured', reason: 'suspended' });
        await call(admin, { method: 'POST', cookie: boss, body: { action: 'set_status', site_id: id, status: 'active' } });

        await call(mySite, { method: 'PUT', cookie: op, body: { action: 'request_custom_domain', domain: 'jay.example.org' } });
        await call(admin, { method: 'POST', cookie: boss, body: { action: 'approve_custom', site_id: id } });
        const site = (await global.__sql`SELECT domain, plan, status FROM sites WHERE id = ${id}`)[0];
        expect(site).toEqual({ domain: 'jay.example.org', plan: 'custom', status: 'active' });
        const hist = await global.__sql`SELECT plan, platform_share FROM site_rate_history WHERE site_id = ${id} ORDER BY id`;
        expect(hist.map(h => [h.plan, Number(h.platform_share)])).toEqual([['free', 25], ['custom', 15]]);

        await call(admin, { method: 'POST', cookie: boss, body: { action: 'set_rate', site_id: id, platform_share: 10 } });
        expect((await call(mySite, { cookie: op })).body.site.platform_share).toBe(10);

        const ownerId = (await global.__sql`SELECT id FROM owners WHERE email = 'j@x.com'`)[0].id;
        await call(admin, { method: 'POST', cookie: boss, body: { action: 'disable_owner', owner_id: ownerId } });
        expect((await call(auth, { query: { action: 'me' }, cookie: op })).body.owner).toBeNull();
        expect((await post(auth, 'login', { email: 'j@x.com', password: 'correct horse battery' })).status).toBe(401);

        const log = await global.__sql`SELECT action FROM audit_log WHERE action <> 'terms_accepted' ORDER BY id`;
        expect(log.map(l => l.action)).toEqual(['set_status', 'set_status', 'approve_custom', 'set_rate', 'disable_owner']);
    });
});

describe('dashboard support', () => {
    it('sign-up needs the terms box ticked and records the acceptance', async () => {
        const noTerms = await post(auth, 'register', { email: 't@x.com', name: 'Tee', password: 'correct horse battery' });
        expect(noTerms.status).toBe(400);
        expect(noTerms.body.error).toMatch(/Terms/);
        const ok = await post(auth, 'register', { email: 't@x.com', name: 'Tee', password: 'correct horse battery', accept_terms: true });
        expect(ok.status).toBe(201);
        const log = await global.__sql`SELECT action, target, detail FROM audit_log`;
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({ action: 'terms_accepted', target: 't@x.com' });
        expect(log[0].detail.version).toBe('2026-10-04');
    });

    it('owners can delete their own account and site, with password + DELETE', async () => {
        const c = await signup('self@x.com', '5.9.9.1');
        await call(mySite, { method: 'POST', cookie: c, body: { name: 'Self Co', subdomain: 'self-co' } });
        expect((await post(auth, 'delete_account', { password: 'wrong wrong wrong', confirm: 'DELETE' }, { cookie: c })).status).toBe(401);
        expect((await post(auth, 'delete_account', { password: 'correct horse battery', confirm: 'yes' }, { cookie: c })).status).toBe(400);
        expect((await post(auth, 'delete_account', { password: 'correct horse battery', confirm: 'DELETE' }, {})).status).toBe(401);
        const r = await post(auth, 'delete_account', { password: 'correct horse battery', confirm: 'DELETE' }, { cookie: c });
        expect(r.status).toBe(200);
        expect(r.headers['Set-Cookie']).toMatch(/Max-Age=0/);
        expect((await global.__sql`SELECT 1 FROM owners WHERE email = 'self@x.com'`)).toHaveLength(0);
        expect((await global.__sql`SELECT 1 FROM sites`)).toHaveLength(0);
        expect((await call(auth, { query: { action: 'me' }, cookie: c })).body.owner).toBeNull();
    });

    it('admins cannot be deleted through the self-service route', async () => {
        await global.__sql`INSERT INTO owners (email, name, password_hash, role) VALUES ('boss2@x.com','Boss',${await hashPassword('boss passphrase 123')},'admin')`;
        const login = await post(auth, 'login', { email: 'boss2@x.com', password: 'boss passphrase 123' });
        const r = await post(auth, 'delete_account', { password: 'boss passphrase 123', confirm: 'DELETE' }, { cookie: cookieOf(login) });
        expect(r.status).toBe(403);
    });

    it('my-site returns DNS targets and a history that fills as things happen', async () => {
        const c = await signup('hist@x.com', '5.9.9.2');
        const empty = await call(mySite, { cookie: c });
        expect(empty.body).toMatchObject({ site: null, events: [], dns: { cname: 'cname.vercel-dns-0.com', a: '76.76.21.21' } });
        await call(mySite, { method: 'POST', cookie: c, body: { name: 'Hist Co', subdomain: 'hist-co' } });
        await call(mySite, { method: 'PUT', cookie: c, body: { action: 'request_custom_domain', domain: 'hist.example.org' } });
        const full = await call(mySite, { cookie: c });
        expect(full.body.events.map(e => e.event)).toEqual(['custom_domain_requested', 'site_created']);
        expect(full.body.events[1].detail).toMatchObject({ plan: 'free', status: 'active' });
    });

    it('site creation still works if the history table has not been created yet', async () => {
        await global.__sql`DROP TABLE site_events`;
        const c = await signup('nohist@x.com', '5.9.9.3');
        const r = await call(mySite, { method: 'POST', cookie: c, body: { name: 'No Hist', subdomain: 'no-hist' } });
        expect(r.status).toBe(201);
        expect((await call(mySite, { cookie: c })).body.events).toEqual([]);
    });

    it('DNS check validates a custom domain and rejects when there is nothing to check', async () => {
        const c = await signup('dns@x.com', '5.9.9.4');
        await call(mySite, { method: 'POST', cookie: c, body: { name: 'Dns Co', subdomain: 'dns-co' } });
        expect((await call(mySite, { cookie: c, query: { check_dns: '1' } })).status).toBe(400);
    });
});

describe('checkDomain', () => {
    const fake = ({ cname = [], a = [] }) => ({
        resolveCname: async () => { if (!cname.length) throw new Error('ENODATA'); return cname; },
        resolve4: async () => { if (!a.length) throw new Error('ENODATA'); return a; },
    });
    it('recognises records that point at the platform', async () => {
        expect((await checkDomain('t.x.com', fake({ cname: ['cname.vercel-dns-0.com'] }))).pointing).toBe(true);
        expect((await checkDomain('t.x.com', fake({ cname: ['065d4578f0593369.vercel-dns-017.com'] }))).pointing).toBe(true);
        expect((await checkDomain('x.com', fake({ a: ['76.76.21.21'] }))).pointing).toBe(true);
        expect((await checkDomain('x.com', fake({ a: ['216.198.79.1'] }))).pointing).toBe(true);
    });
    it('reports domains that are elsewhere or missing', async () => {
        expect((await checkDomain('x.com', fake({ a: ['1.2.3.4'] }))).pointing).toBe(false);
        expect((await checkDomain('x.com', fake({ cname: ['example.net'] }))).pointing).toBe(false);
        expect((await checkDomain('x.com', fake({}))).pointing).toBe(false);
    });
});
