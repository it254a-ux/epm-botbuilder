/** @jest-environment node */
// Tests the Market Forecast proxy: input checks, the "offline" and "slow" answers, and that the secret and
// the service address never reach the visitor.
const handler = require('../kronos-forecast');

const candles = Array.from({ length: 80 }, (_, i) => ({ t: 1_700_000_000 + i * 300, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i }));

function call(body, { ip = '9.9.9.9', method = 'POST' } = {}) {
    return new Promise(resolve => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            json(b) { resolve({ status: this.code, body: b }); },
        };
        handler({ method, headers: { 'x-forwarded-for': ip }, body, socket: {} }, res);
    });
}

const okService = payload => jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });

beforeEach(() => {
    process.env.KRONOS_URL = 'https://kronos.example.dev/';
    process.env.KRONOS_SECRET = 'top-secret';
});
afterEach(() => { delete global.fetch; });

test('only POST is allowed', async () => {
    expect((await call({}, { method: 'GET' })).status).toBe(405);
});

test('without KRONOS_URL visitors get a plain message, not the reason', async () => {
    delete process.env.KRONOS_URL;
    const r = await call({ candles }, { ip: '1.1.1.1' });
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).not.toMatch(/KRONOS|env/i);
});

test.each([
    ['too few candles', { candles: candles.slice(0, 10) }],
    ['times not increasing', { candles: [...candles.slice(0, 70), { ...candles[0] }] }],
    ['high below the body', { candles: [...candles.slice(0, 70), { t: 1_800_000_000, o: 10, h: 5, l: 4, c: 9 }] }],
    ['bad horizon', { candles, pred_len: 500 }],
    ['sell with TP above SL', { candles, levels: { side: 'sell', tp: 120, sl: 110 } }],
])('rejects %s', async (_name, body) => {
    global.fetch = jest.fn();
    const r = await call(body, { ip: `2.2.2.${Math.floor(Math.random() * 200)}` });
    expect(r.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
});

test('passes a good request to the service with the key and returns its answer', async () => {
    const payload = { step: 300, paths: [[{ t: 1, o: 1, h: 2, l: 0, c: 1 }]], up_share: 0.5 };
    global.fetch = okService(payload);
    const r = await call({ candles, pred_len: 30, paths: 4, levels: { side: 'buy', tp: 200, sl: 90 } }, { ip: '3.3.3.3' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual(payload);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://kronos.example.dev/forecast');
    expect(init.headers['X-API-Key']).toBe('top-secret');
    expect(JSON.parse(init.body)).toMatchObject({ pred_len: 30, paths: 4, levels: { side: 'buy', tp: 200, sl: 90 } });
});

test('a service that is switched off is reported as offline, without details', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8000'));
    const r = await call({ candles }, { ip: '4.4.4.4' });
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('offline');
    expect(JSON.stringify(r.body)).not.toMatch(/ECONN|127\.0|kronos\.example|top-secret/);
});

test('a tunnel page that is not JSON counts as offline', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error('not json'); } });
    expect((await call({ candles }, { ip: '5.5.5.5' })).body.code).toBe('offline');
});

test('a call that takes too long says the model is warming up', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abort);
    const r = await call({ candles }, { ip: '6.6.6.6' });
    expect(r.status).toBe(504);
    expect(r.body.code).toBe('slow');
});

test('one visitor is limited per minute', async () => {
    global.fetch = okService({ paths: [[]] });
    const results = [];
    for (let i = 0; i < 6; i += 1) results.push((await call({ candles }, { ip: '7.7.7.7' })).status);
    expect(results.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(results[4]).toBe(429);
});
