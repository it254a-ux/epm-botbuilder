/** @jest-environment node */
// Tests the Market Forecast proxy: input checks, starting and checking a forecast, the "offline", "busy" and
// "lost" answers, and that the secret and the service address never reach the visitor.
const handler = require('../kronos-forecast');

const candles = Array.from({ length: 80 }, (_, i) => ({ t: 1_700_000_000 + i * 300, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i }));
const JOB = 'a'.repeat(32);

function call({ method = 'POST', body, query, ip = '9.9.9.9' } = {}) {
    return new Promise(resolve => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            json(b) { resolve({ status: this.code, body: b }); },
        };
        handler({ method, headers: { 'x-forwarded-for': ip }, body, query, socket: {} }, res);
    });
}

const service = (status, payload) =>
    jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => payload });

let n = 0;
const freshIp = () => `10.0.${Math.floor(n / 200)}.${(n += 1) % 200}`;

beforeEach(() => {
    process.env.KRONOS_URL = 'https://kronos.example.dev/';
    process.env.KRONOS_SECRET = 'top-secret';
});
afterEach(() => { delete global.fetch; });

test('only POST and GET are allowed', async () => {
    expect((await call({ method: 'DELETE' })).status).toBe(405);
});

test('without KRONOS_URL visitors get a plain message, not the reason', async () => {
    delete process.env.KRONOS_URL;
    const r = await call({ body: { candles }, ip: freshIp() });
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).not.toMatch(/KRONOS|env/i);
});

describe('starting a forecast (POST)', () => {
    test.each([
        ['too few candles', { candles: candles.slice(0, 10) }],
        ['times not increasing', { candles: [...candles.slice(0, 70), { ...candles[0] }] }],
        ['high below the body', { candles: [...candles.slice(0, 70), { t: 1_800_000_000, o: 10, h: 5, l: 4, c: 9 }] }],
        ['bad horizon', { candles, pred_len: 500 }],
        ['sell with TP above SL', { candles, levels: { side: 'sell', tp: 120, sl: 110 } }],
    ])('rejects %s', async (_name, body) => {
        global.fetch = jest.fn();
        expect((await call({ body, ip: freshIp() })).status).toBe(400);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sends a good request to the service with the key and returns only the job id', async () => {
        global.fetch = service(200, { job: JOB, internal: 'x' });
        const r = await call({ body: { candles, pred_len: 30, paths: 4, levels: { side: 'buy', tp: 200, sl: 90 } }, ip: freshIp() });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ job: JOB });
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://kronos.example.dev/jobs');
        expect(init.headers['X-API-Key']).toBe('top-secret');
        expect(JSON.parse(init.body)).toMatchObject({ pred_len: 30, paths: 4, levels: { side: 'buy', tp: 200, sl: 90 } });
    });

    test('a busy service is reported as busy, not offline', async () => {
        global.fetch = service(429, { detail: 'busy' });
        const r = await call({ body: { candles }, ip: freshIp() });
        expect(r.status).toBe(429);
        expect(r.body.code).toBe('busy');
    });

    test('a service that is switched off is reported as offline, without details', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));
        const r = await call({ body: { candles }, ip: freshIp() });
        expect(r.status).toBe(502);
        expect(r.body.code).toBe('offline');
        expect(JSON.stringify(r.body)).not.toMatch(/ECONN|127\.0|kronos\.example|top-secret/);
    });

    test('a tunnel page that is not JSON counts as offline', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error('not json'); } });
        expect((await call({ body: { candles }, ip: freshIp() })).body.code).toBe('offline');
    });

    test('an answer without a proper job id counts as offline', async () => {
        global.fetch = service(200, { job: '../../etc/passwd' });
        expect((await call({ body: { candles }, ip: freshIp() })).body.code).toBe('offline');
    });

    test('a slow answer is reported as slow', async () => {
        global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        const r = await call({ body: { candles }, ip: freshIp() });
        expect(r.status).toBe(504);
        expect(r.body.code).toBe('slow');
    });

    test('one visitor is limited per minute', async () => {
        global.fetch = service(200, { job: JOB });
        const ip = freshIp();
        const codes = [];
        for (let i = 0; i < 6; i += 1) codes.push((await call({ body: { candles }, ip })).status);
        expect(codes.slice(0, 4)).toEqual([200, 200, 200, 200]);
        expect(codes[4]).toBe(429);
    });
});

describe('checking a forecast (GET ?id=...)', () => {
    test('rejects an id that is not a plain job id (nothing is forwarded)', async () => {
        global.fetch = jest.fn();
        for (const id of ['', '../health', 'abc', `${JOB}/x`, undefined]) {
            expect((await call({ method: 'GET', query: { id }, ip: freshIp() })).status).toBe(400);
        }
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('passes running / done / error through, with the key', async () => {
        const ip = freshIp();
        global.fetch = service(200, { status: 'running', elapsed: 12, secretStuff: 'x' });
        let r = await call({ method: 'GET', query: { id: JOB }, ip });
        expect(r.body).toEqual({ status: 'running', elapsed: 12 });
        expect(global.fetch.mock.calls[0][0]).toBe(`https://kronos.example.dev/jobs/${JOB}`);
        expect(global.fetch.mock.calls[0][1].headers['X-API-Key']).toBe('top-secret');

        global.fetch = service(200, { status: 'done', elapsed: 80, result: { paths: [[]], up_share: 0.5 } });
        r = await call({ method: 'GET', query: { id: JOB }, ip });
        expect(r.body.result).toEqual({ paths: [[]], up_share: 0.5 });

        global.fetch = service(200, { status: 'error', error: 'The model hit a problem. Please try again.' });
        r = await call({ method: 'GET', query: { id: JOB }, ip });
        expect(r.body).toMatchObject({ status: 'error', error: 'The model hit a problem. Please try again.' });
    });

    test('a forecast the service no longer knows (it restarted) is reported as lost', async () => {
        global.fetch = service(404, { detail: 'unknown job' });
        const r = await call({ method: 'GET', query: { id: JOB }, ip: freshIp() });
        expect(r.status).toBe(410);
        expect(r.body.code).toBe('lost');
    });

    test('service switched off is offline; odd answers are offline too', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        expect((await call({ method: 'GET', query: { id: JOB }, ip: freshIp() })).body.code).toBe('offline');
        global.fetch = service(200, { status: 'weird' });
        expect((await call({ method: 'GET', query: { id: JOB }, ip: freshIp() })).body.code).toBe('offline');
    });

    test('checking is limited per minute but allows plenty of polls', async () => {
        global.fetch = service(200, { status: 'running', elapsed: 1 });
        const ip = freshIp();
        let last;
        for (let i = 0; i < 41; i += 1) last = (await call({ method: 'GET', query: { id: JOB }, ip })).status;
        expect(last).toBe(429);
    });
});
