/** @jest-environment node */
// Tests reading long history from Deriv in pages of at most 5000 candles.
const { getCandlesBack } = require('../_lib/deriv');

const TF = 3600;
/** A fake Deriv that holds `total` hourly candles and answers like ticks_history does. */
function fakeClient(total, newest = 1_800_000_000) {
    const all = Array.from({ length: total }, (_, i) => ({ epoch: newest - (total - 1 - i) * TF, open: '1', high: '2', low: '0.5', close: '1.5' }));
    const calls = [];
    return {
        calls,
        send: async req => {
            calls.push(req);
            const endEpoch = req.end === 'latest' ? Infinity : req.end;
            const upTo = all.filter(c => c.epoch <= endEpoch);
            return { candles: upTo.slice(-Math.min(req.count, 5000)) };
        },
    };
}

test('a short history is one request', async () => {
    const c = fakeClient(3000);
    const rows = await getCandlesBack(c, 'frxXAUUSD', TF, 100); // 2400 candles wanted
    expect(c.calls).toHaveLength(1);
    expect(rows).toHaveLength(2400);
    expect(c.calls[0]).toMatchObject({ ticks_history: 'frxXAUUSD', style: 'candles', granularity: TF, end: 'latest', count: 2400 });
});

test('two years of hourly candles are read in pages, oldest first, with no gaps or duplicates', async () => {
    const c = fakeClient(20000);
    const rows = await getCandlesBack(c, 'frxEURUSD', TF, 730); // 17520 candles
    expect(c.calls).toHaveLength(4);
    expect(c.calls.map(x => x.count)).toEqual([5000, 5000, 5000, 2520]);
    expect(rows).toHaveLength(17520);
    for (let i = 1; i < rows.length; i++) expect(rows[i].time - rows[i - 1].time).toBe(TF);
    expect(new Set(rows.map(r => r.time)).size).toBe(rows.length);
    expect(rows[rows.length - 1].time).toBe(1_800_000_000); // newest candle is kept
});

test('each page ends just before the oldest candle of the previous page', async () => {
    const c = fakeClient(20000);
    await getCandlesBack(c, 'x', TF, 730);
    expect(c.calls[1].end).toBe(1_800_000_000 - 4999 * TF - 1);
});

test('stops when the market has less history than asked for', async () => {
    const c = fakeClient(7000);
    const rows = await getCandlesBack(c, 'x', TF, 730);
    expect(rows).toHaveLength(7000);
    expect(c.calls).toHaveLength(2); // second page came back short: nothing older exists
});

test('a market with no data returns an empty list, not an error', async () => {
    const c = { send: async () => ({ candles: [] }) };
    expect(await getCandlesBack(c, 'x', TF, 30)).toEqual([]);
});

test('prices are numbers', async () => {
    const rows = await getCandlesBack(fakeClient(50), 'x', TF, 1);
    expect(rows[0]).toEqual({ time: expect.any(Number), open: 1, high: 2, low: 0.5, close: 1.5 });
});

test('a Deriv error is passed up so the market can be reported as skipped', async () => {
    const c = { send: async () => { throw new Error('RateLimit: too many requests'); } };
    await expect(getCandlesBack(c, 'x', TF, 30)).rejects.toThrow(/RateLimit/);
});
