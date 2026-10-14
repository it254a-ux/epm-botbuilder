/** @jest-environment node */
// Tests the Forex Trader AI endpoint: usage limits (real in-memory Postgres), timeout,
// and that visitors never see internal details such as the missing-key reason.
const { PGlite } = require('@electric-sql/pglite');

jest.mock('../_lib/db', () => ({ getDb: () => global.__sql }));

const limit = require('../_lib/forex-limit');
const handler = require('../forex-analyse');

function makeSql() {
    const db = new PGlite();
    const sql = async (strings, ...vals) => {
        let q = '';
        strings.forEach((s, i) => { q += s; if (i < vals.length) q += `$${i + 1}`; });
        return (await db.query(q, vals.map(v => (v === undefined ? null : v)))).rows;
    };
    sql.db = db;
    return sql;
}

function call(body, { ip = '1.1.1.1', method = 'POST' } = {}) {
    return new Promise(resolve => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            json(b) { resolve({ status: this.code, body: b }); },
        };
        handler({ method, headers: { 'x-forwarded-for': ip }, body, socket: {} }, res);
    });
}

const analysis = { state: 'waiting_for_sweep', plan: null };
const geminiAnswer = obj => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
});

const ENV = { ...process.env };
beforeEach(() => {
    process.env = { ...ENV, GEMINI_API_KEY: 'test-key' };
    delete process.env.DATABASE_URL;
    delete process.env.FOREX_AI_DAILY_CAP;
    delete process.env.FOREX_AI_IP_DAILY;
    delete process.env.FOREX_AI_PER_MINUTE;
    limit._reset();
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe('usage limits kept in the database', () => {
    beforeEach(async () => {
        process.env.DATABASE_URL = 'postgres://test';
        global.__sql = makeSql();
    });

    test('creates its own table and refuses the 9th request in a minute', async () => {
        for (let i = 0; i < 8; i++) expect(await limit.takeSlot('9.9.9.9')).toBeNull();
        expect(await limit.takeSlot('9.9.9.9')).toBe('minute');
        // a different visitor is not affected
        expect(await limit.takeSlot('8.8.8.8')).toBeNull();
        const rows = await global.__sql`SELECT visitor FROM forex_ai_usage`;
        expect(rows).toHaveLength(9);
        expect(rows.every(r => !r.visitor.includes('9.9.9.9'))).toBe(true); // IP is stored hashed
    });

    test('the global daily cap stops everyone', async () => {
        process.env.FOREX_AI_DAILY_CAP = '3';
        expect(await limit.takeSlot('1.0.0.1')).toBeNull();
        expect(await limit.takeSlot('1.0.0.2')).toBeNull();
        expect(await limit.takeSlot('1.0.0.3')).toBeNull();
        expect(await limit.takeSlot('1.0.0.4')).toBe('global_day');
    });

    test('the per-visitor daily cap stops one visitor only', async () => {
        process.env.FOREX_AI_IP_DAILY = '2';
        expect(await limit.takeSlot('2.0.0.1')).toBeNull();
        expect(await limit.takeSlot('2.0.0.1')).toBeNull();
        expect(await limit.takeSlot('2.0.0.1')).toBe('visitor_day');
        expect(await limit.takeSlot('2.0.0.2')).toBeNull();
    });

    test('old requests (over a day) no longer count', async () => {
        process.env.FOREX_AI_DAILY_CAP = '1';
        expect(await limit.takeSlot('3.0.0.1')).toBeNull();
        await global.__sql`UPDATE forex_ai_usage SET created_at = now() - interval '2 days'`;
        expect(await limit.takeSlot('3.0.0.2')).toBeNull();
    });

    test('falls back to the memory counter if the database breaks', async () => {
        global.__sql = () => { throw new Error('db down'); };
        for (let i = 0; i < 8; i++) expect(await limit.takeSlot('4.0.0.1')).toBeNull();
        expect(await limit.takeSlot('4.0.0.1')).toBe('minute');
    });
});

describe('the endpoint', () => {
    test('rejects anything but POST', async () => {
        expect((await call({}, { method: 'GET' })).status).toBe(405);
    });

    test('a missing key gives visitors a plain message with no internal details', async () => {
        delete process.env.GEMINI_API_KEY;
        const r = await call({ analysis });
        expect(r.status).toBe(503);
        expect(r.body.error).toBe('The AI review is not available right now.');
        expect(JSON.stringify(r.body)).not.toMatch(/GEMINI|Vercel|key/i);
        expect(console.error).toHaveBeenCalled(); // the real reason is only logged
    });

    test('a normal request returns the cleaned AI answer', async () => {
        global.fetch.mockResolvedValue(geminiAnswer({ status: 'waiting_for_pov', confidence: 61, reasoning: 'ok', warnings: [] }));
        const r = await call({ analysis });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ status: 'waiting_for_pov', confidence: 61 });
        expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
    });

    test('the AI can never turn a not-ready setup into a BUY/SELL', async () => {
        global.fetch.mockResolvedValue(geminiAnswer({ status: 'sell_ready', confidence: 90, reasoning: 'x', warnings: [] }));
        const r = await call({ analysis });
        expect(r.body.status).toBe('waiting_for_pov');
    });

    test('the daily cap returns a friendly 429 and never reaches Gemini', async () => {
        process.env.FOREX_AI_DAILY_CAP = '1';
        global.fetch.mockResolvedValue(geminiAnswer({ status: 'waiting_for_pov', confidence: 50, reasoning: '', warnings: [] }));
        expect((await call({ analysis }, { ip: '5.0.0.1' })).status).toBe(200);
        const r = await call({ analysis }, { ip: '5.0.0.2' });
        expect(r.status).toBe(429);
        expect(r.body.error).toMatch(/limit for today/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('gives up after 20 seconds with a 504', async () => {
        jest.useFakeTimers();
        global.fetch.mockImplementation((url, opts) => new Promise((resolve, reject) => {
            opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
        }));
        const pending = call({ analysis });
        await jest.advanceTimersByTimeAsync(20_001);
        const r = await pending;
        expect(r.status).toBe(504);
        expect(r.body.error).toMatch(/too long/);
    });

    test('a Gemini error shows a generic message and only the status number, not Google\'s details', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'API key not valid' });
        const r = await call({ analysis });
        expect(r.status).toBe(502);
        expect(r.body.code).toBe(403);
        expect(r.body.error).not.toMatch(/API key|valid|403/i);
    });

    test('a busy Gemini (429) gets its own friendly message', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'quota' });
        const r = await call({ analysis });
        expect(r.body.error).toMatch(/busy/);
        expect(r.body.code).toBe(429);
    });

    test('an unknown model name (404) retries once with the fallback model', async () => {
        global.fetch
            .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'model not found' })
            .mockResolvedValueOnce(geminiAnswer({ status: 'waiting_for_pov', confidence: 40, reasoning: '', warnings: [] }));
        const r = await call({ analysis });
        expect(r.status).toBe(200);
        expect(r.body.model).toBe('gemini-3.5-flash-lite');
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[1][0]).toMatch(/gemini-3\.5-flash-lite/);
    });

    describe('candles sent along with the screenshot', () => {
        const candles = [
            [1760400000, 100, 101, 99, 100.5],
            [1760400900, 100.5, 102, 100, 101],
        ];

        test('are passed to Gemini as plain text lines', async () => {
            global.fetch.mockResolvedValue(geminiAnswer({ status: 'waiting_for_pov', confidence: 50, reasoning: '', warnings: [] }));
            const r = await call({ analysis, candles });
            expect(r.status).toBe(200);
            const sent = JSON.parse(global.fetch.mock.calls[0][1].body).contents[0].parts.map(p => p.text || '').join('\n');
            expect(sent).toMatch(/Last 2 closed candles/);
            expect(sent).toMatch(/2025-10-14T00:00Z 100 101 99 100.5/);
        });

        test('are optional', async () => {
            global.fetch.mockResolvedValue(geminiAnswer({ status: 'waiting_for_pov', confidence: 50, reasoning: '', warnings: [] }));
            expect((await call({ analysis })).status).toBe(200);
        });

        test('bad shapes are refused before reaching Gemini', async () => {
            const bad = [
                'text',
                [[1, 2, 3]],
                [[1760400000, 100, 99, 101, 100]], // high below low
                [[1760400000, 'a', 1, 1, 1]],
                Array.from({ length: 121 }, (_, i) => [1760400000 + i * 900, 1, 2, 0.5, 1.5]),
            ];
            for (const c of bad) {
                limit._reset();
                const r = await call({ analysis, candles: c });
                expect(r.status).toBe(400);
            }
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });
});
