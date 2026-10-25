/** @jest-environment node */
// The live stream for the admin switch: it tells the browser the value at once and again the moment it changes.
jest.mock('../db', () => ({ getDb: () => global.__fakeSql }));
process.env.FLAG_STREAM_MS = '700';
process.env.FLAG_POLL_MS = '40';
const handler = require('../../site-settings');

const makeSql = () => {
    const state = { on: true };
    const sql = (strings, ...vals) => {
        const q = strings.join('?');
        if (/^\s*SELECT/i.test(q)) return Promise.resolve([{ on_state: state.on }]);
        return Promise.resolve([]);
    };
    return { sql, state };
};

test('sends the value, then the new value as soon as the admin changes it, then ends', async () => {
    const { sql, state } = makeSql();
    global.__fakeSql = sql;
    const chunks = [];
    let ended = false;
    const res = { writeHead: jest.fn(), write: c => chunks.push(String(c)), end: () => { ended = true; }, setHeader: jest.fn(), status: () => res, json: () => {} };
    const req = { method: 'GET', query: { flag: 'forced_real', stream: '1' }, headers: {}, on: jest.fn() };
    const run = handler(req, res);
    setTimeout(() => { state.on = false; }, 250);
    await run;
    const data = chunks.filter(c => c.startsWith('data:')).map(c => JSON.parse(c.slice(5)).on);
    expect(data).toEqual([true, false]);
    expect(ended).toBe(true);
    expect(res.writeHead.mock.calls[0][1]['Content-Type']).toMatch(/text\/event-stream/);
});
