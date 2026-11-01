// The one-time Neon -> Turso copy, tested with fake Neon rows (as the Postgres driver returns them) and a real SQLite engine.
jest.setTimeout(30000);
const ENV = { ...process.env };
let db;
beforeAll(() => {
    process.env = { ...ENV, TURSO_DATABASE_URL: 'file::memory:' };
    delete process.env.DATABASE_URL;
    db = require('../_lib/db');
});
afterAll(() => { db.resetDb(); process.env = ENV; });

const { migrate, toValue } = require('../_lib/migrate-neon');

const NEON = {
    owners: [{ id: 3, email: 'a@b.co', name: 'A', password_hash: 'h', role: 'admin', disabled: false, created_at: new Date('2026-01-02T03:04:05.000Z') }],
    sites: [{ id: 1, domain: 'x.com', name: 'X', owner_id: 3, plan: 'custom', status: 'active', commission_rate_override: '12.50', created_at: new Date('2026-01-02T03:04:05.000Z'), updated_at: new Date('2026-01-02T03:04:05.000Z') }],
    audit_log: [{ id: 1, owner_id: 3, action: 'x', target: 't', detail: { a: 1 }, created_at: new Date('2026-01-02T03:04:05.000Z') }],
    free_bots: [{ id: 7, name: 'Bot', description: 'd', market: 'm', risk_level: 'low', contract_type: null, xml_content: '<xml/>', created_at: new Date('2026-02-01T00:00:00.000Z') }],
    app_flags: [{ key: 'forced_real', on_state: false, updated_at: new Date('2026-02-01T00:00:00.000Z') }],
    signals: [{ id: 5, dedupe_key: 'k', symbol: 's', strategy_id: 1, strategy_name: 'n', timeframe: 300, side: 'BUY', entry: 1, stop_loss: 0.5, take_profit: 2, rr: 2, status: 'hit_tp', candle_time: '1700000000', telegram_sent: true, created_at: new Date('2026-02-01T00:00:00.000Z'), updated_at: new Date('2026-02-01T00:00:00.000Z') }],
};
const read = async t => NEON[t] || [];

test('values are converted the way Turso needs', () => {
    expect(toValue(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(toValue(true)).toBe(1);
    expect(toValue({ a: 1 })).toBe('{"a":1}');
    expect(toValue(undefined)).toBeNull();
});

test('dry run copies nothing; the real run copies everything; a second run adds nothing', async () => {
    const sql = db.getDb();
    const dry = await migrate({ read, sql, dry: true });
    expect(dry.find(r => r.table === 'free_bots').found).toBe(1);
    expect(await sql`SELECT id FROM free_bots`).toHaveLength(0);

    const first = await migrate({ read, sql });
    expect(first.every(r => !r.error)).toBe(true);
    expect(first.find(r => r.table === 'free_bots')).toMatchObject({ copied: 1, alreadyThere: 0 });

    const [bot] = await sql`SELECT id, name, xml_content, created_at FROM free_bots`;
    expect(bot).toMatchObject({ id: 7, name: 'Bot', xml_content: '<xml/>' });
    expect(bot.created_at instanceof Date).toBe(true);
    const [owner] = await sql`SELECT disabled, role FROM owners WHERE id = 3`;
    expect(owner).toEqual({ disabled: false, role: 'admin' });
    const [log] = await sql`SELECT detail FROM audit_log`;
    expect(log.detail).toEqual({ a: 1 });
    const [flag] = await sql`SELECT on_state FROM app_flags WHERE key = 'forced_real'`;
    expect(flag.on_state).toBe(false);
    expect((await sql`SELECT telegram_sent, status FROM signals`)[0]).toEqual({ telegram_sent: true, status: 'hit_tp' });

    const second = await migrate({ read, sql });
    expect(second.find(r => r.table === 'free_bots')).toMatchObject({ copied: 0, alreadyThere: 1 });
    expect(await sql`SELECT id FROM free_bots`).toHaveLength(1);
});

test('a column that exists only in Neon is added to Turso and its data is kept; the signal tables exist first', async () => {
    const sql = db.getDb();
    await require('../_lib/signals-store').ensureTables(sql);
    const rows = { signal_watchlist: [{ symbol: '1HZ100V', enabled: true, updated_at: new Date('2026-02-01T00:00:00.000Z') }], sites: [{ id: 9, domain: 'y.com', name: 'Y', owner_id: null, markup_percent: '1.50', created_at: new Date(), updated_at: new Date() }] };
    const rep = await migrate({ read: async t => rows[t] || [], sql });
    expect(rep.find(r => r.table === 'signal_watchlist')).toMatchObject({ copied: 1 });
    const sites = rep.find(r => r.table === 'sites');
    expect(sites).toMatchObject({ copied: 1 });
    expect(sites.error).toBeUndefined();
    expect(sites.addedColumns).toEqual(['markup_percent']);
    const [row] = await sql`SELECT markup_percent FROM sites WHERE id = 9`;
    expect(Number(row.markup_percent)).toBe(1.5);
});

test('a row that a rule refuses is reported, not hidden', async () => {
    const sql = db.getDb();
    const rep = await migrate({ read: async t => (t === 'sites' ? [{ id: 12, domain: 'z.com', name: 'Z', owner_id: 3 }] : []), sql });
    expect(rep.find(r => r.table === 'sites').refused).toEqual([12]);
});

test('a table Neon cannot read is reported and the others still copy', async () => {
    const sql = db.getDb();
    const rep = await migrate({ read: async t => { if (t === 'sites') throw new Error('quota'); return []; }, sql });
    expect(rep.find(r => r.table === 'sites').error).toContain('quota');
    expect(rep.find(r => r.table === 'free_bots').error).toBeUndefined();
});
