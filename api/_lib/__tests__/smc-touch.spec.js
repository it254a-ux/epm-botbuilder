jest.mock('../smc', () => ({ analyseSmc: jest.fn() }));
const smc = require('../smc');
const { findSmcSell, formatSmcSell, readSmcConfig } = require('../smc-touch');

const cfg = readSmcConfig({});
const now = 1_700_000_000;
const c15 = Array.from({ length: 80 }, (_, i) => ({ time: now - (80 - i) * 900 - 450, open: 100, high: 101, low: 99, close: 100 }));
const overlay = (extra = {}) => ({
    side: 'SELL',
    zone: { top: 111, bottom: 109, startTime: 42, label: 'SELL ENTRY AREA' },
    area: { entry: 109, stopLoss: 113, takeProfit: 95, fromTime: now - 3600 },
    plan: null,
    partialTp: 102,
    ...extra,
});
const minute = (t, high) => ({ time: t, open: high - 1, high, low: high - 2, close: high - 1 });
const run = (a, m1) => {
    smc.analyseSmc.mockReturnValue(a);
    return findSmcSell(c15, m1, 'forex', now, cfg);
};

test('sends nothing while price is still below the entry', () => {
    expect(run({ state: 'waiting_for_sweep', smc: overlay() }, [minute(now - 60, 105)]).stage).toBe('waiting');
});
test('touched when a fresh minute reaches the entry', () => {
    const r = run({ state: 'waiting_for_sweep', smc: overlay() }, [minute(now - 120, 105), minute(now - 60, 109.5)]);
    expect(r.stage).toBe('touched');
    expect(r.key).toBe('42');
});
test('an old touch is too late', () => {
    expect(run({ state: 'waiting_for_sweep', smc: overlay() }, [minute(now - 3000, 109.5)]).stage).toBe('none');
});
test('price past the invalidation level cancels it', () => {
    expect(run({ state: 'waiting_for_sweep', smc: overlay() }, [minute(now - 60, 114)]).stage).toBe('none');
});
test('a buy setup or a finished setup is ignored', () => {
    expect(run({ state: 'waiting_for_sweep', smc: overlay({ side: 'BUY' }) }, [minute(now - 60, 109.5)]).stage).toBe('none');
    expect(run({ state: 'invalidated', smc: overlay() }, [minute(now - 60, 109.5)]).stage).toBe('none');
});
test('the confirmed plan entry is used when it exists', () => {
    const plan = { entry: 107, stopLoss: 113, takeProfit: 95, fromTime: now - 1200 };
    expect(run({ state: 'ready', smc: overlay({ plan }) }, [minute(now - 60, 107.5)]).stage).toBe('touched');
});
test('the message says SELL, the entry, and names the multiplier', () => {
    const r = run({ state: 'waiting_for_sweep', smc: overlay() }, [minute(now - 60, 109.5)]);
    const text = formatSmcSell(r, 'Gold/USD', cfg, {});
    expect(text).toContain('SELL');
    expect(text).toContain('<code>109</code>');
    expect(text).toContain('×100');
    expect(text).not.toContain('Stop loss');
});
