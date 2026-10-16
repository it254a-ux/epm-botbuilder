const { checkEntry } = require('../signal-entry');

const BUY = { side: 'BUY', entry: 100, stopLoss: 98, takeProfit: 104 };
const SELL = { side: 'SELL', entry: 100, stopLoss: 102, takeProfit: 96 };
const m = (time, low, high) => ({ time, open: low, high, low, close: high });
const FROM = 1000;
const NOW = 1000 + 600;
const FRESH = 300;

describe('checkEntry', () => {
    test('nothing yet: price stayed above the BUY entry', () => {
        expect(checkEntry(BUY, [m(1000, 101, 103), m(1060, 100.5, 102)], FROM, NOW, FRESH)).toEqual({ status: 'waiting' });
        expect(checkEntry(BUY, [], FROM, NOW, FRESH)).toEqual({ status: 'waiting' });
    });
    test('a recent minute that trades through the entry = touched (BUY and SELL)', () => {
        expect(checkEntry(BUY, [m(1500, 99.9, 101)], FROM, NOW, FRESH)).toEqual({ status: 'touched', touchTime: 1500 });
        expect(checkEntry(SELL, [m(1500, 99, 100.1)], FROM, NOW, FRESH)).toEqual({ status: 'touched', touchTime: 1500 });
    });
    test('touching exactly the entry price counts', () => {
        expect(checkEntry(BUY, [m(1500, 100, 101)], FROM, NOW, FRESH).status).toBe('touched');
    });
    test('an old touch is missed, not sent', () => {
        expect(checkEntry(BUY, [m(1100, 99.9, 101)], FROM, NOW, FRESH)).toEqual({ status: 'missed', touchTime: 1100 });
    });
    test('take profit or stop loss reached first = cancelled', () => {
        expect(checkEntry(BUY, [m(1000, 101, 104.5)], FROM, NOW, FRESH)).toMatchObject({ status: 'cancelled', reason: expect.stringMatching(/take profit before the entry/) });
        expect(checkEntry(BUY, [m(1000, 97.5, 99.5)], FROM, NOW, FRESH)).toMatchObject({ status: 'cancelled', reason: expect.stringMatching(/stop loss before the entry/) });
        expect(checkEntry(SELL, [m(1000, 95, 99.5)], FROM, NOW, FRESH)).toMatchObject({ status: 'cancelled', reason: expect.stringMatching(/take profit before the entry/) });
        expect(checkEntry(SELL, [m(1000, 100.5, 102.5)], FROM, NOW, FRESH)).toMatchObject({ status: 'cancelled', reason: expect.stringMatching(/stop loss before the entry/) });
    });
    test('the first thing that happens decides', () => {
        // touch came first (recent), the target later: touched
        expect(checkEntry(BUY, [m(1500, 99.9, 101), m(1560, 101, 105)], FROM, NOW, FRESH).status).toBe('touched');
        // target first, entry later: cancelled
        expect(checkEntry(BUY, [m(1000, 101, 105), m(1500, 99.9, 101)], FROM, NOW, FRESH).status).toBe('cancelled');
    });
    test('entry and stop/target in one minute = cancelled', () => {
        expect(checkEntry(BUY, [m(1500, 97, 101)], FROM, NOW, FRESH).status).toBe('cancelled');
        expect(checkEntry(BUY, [m(1500, 99, 105)], FROM, NOW, FRESH).status).toBe('cancelled');
    });
    test('minutes before the setup was formed are ignored, and broken candles do not crash it', () => {
        expect(checkEntry(BUY, [m(900, 90, 110)], FROM, NOW, FRESH)).toEqual({ status: 'waiting' });
        expect(checkEntry(BUY, [{ time: 1500, high: NaN, low: NaN }], FROM, NOW, FRESH)).toEqual({ status: 'waiting' });
    });
});
