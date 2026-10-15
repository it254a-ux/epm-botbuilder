/** @jest-environment node */
// Tests the result rules: take profit, stop loss, never entered, expired, same-candle ties, the dollar maths and the message.
const { evaluateSignal, formatResult, resultFor, parseStakes, readResultConfig } = require('../signal-outcome');

const TF = 900;
const T0 = 1_760_000_000 - (1_760_000_000 % TF); // signal candle (open time)
const DAY = 86400;
const at = n => T0 + n * TF; // candle n after the signal candle: n=1 is the first candle after it
const candle = (n, low, high) => ({ time: at(n), open: (low + high) / 2, high, low, close: (low + high) / 2 });
const NOW = at(40); // plenty of time passed, all candles below are closed

const SELL = { side: 'SELL', symbol: 'frxGBPUSD', symbolName: 'GBP/USD', strategyName: 'Previous day high/low sweep', timeframe: TF, time: T0, entry: 100, stopLoss: 102, takeProfit: 90, rr: 5 };
const BUY = { side: 'BUY', symbol: 'frxEURUSD', symbolName: 'EUR/USD', strategyName: 'Asian sweep', timeframe: TF, time: T0, entry: 100, stopLoss: 98, takeProfit: 110, rr: 5 };
const EXP = 24 * 3600;

describe('evaluateSignal', () => {
    test('SELL: enters, then take profit -> win', () => {
        const r = evaluateSignal(SELL, [candle(1, 99, 100.5), candle(2, 94, 99), candle(3, 89, 95)], NOW, EXP);
        expect(r).toEqual({ status: 'hit_tp', enteredTime: at(1), closedTime: at(3) });
    });
    test('SELL: enters, then stop loss -> loss', () => {
        const r = evaluateSignal(SELL, [candle(1, 99, 100.5), candle(2, 99, 102.5)], NOW, EXP);
        expect(r).toEqual({ status: 'hit_sl', enteredTime: at(1), closedTime: at(2) });
    });
    test('BUY: win and loss are mirrored', () => {
        expect(evaluateSignal(BUY, [candle(1, 99.5, 101), candle(2, 105, 111)], NOW, EXP).status).toBe('hit_tp');
        expect(evaluateSignal(BUY, [candle(1, 99.5, 101), candle(2, 97.5, 101)], NOW, EXP).status).toBe('hit_sl');
    });
    test('one candle touching BOTH stop loss and take profit counts as a loss', () => {
        const r = evaluateSignal(SELL, [candle(1, 99, 100.5), candle(2, 89, 103)], NOW, EXP);
        expect(r.status).toBe('hit_sl');
    });
    test('in the candle that enters the trade, the take profit is not counted (only the stop loss is)', () => {
        // enters AND touches take profit in the same candle -> not a win yet; next candle decides
        const same = evaluateSignal(SELL, [candle(1, 89, 101)], NOW, EXP);
        expect(same).toBeNull();
        expect(evaluateSignal(SELL, [candle(1, 89, 101), candle(2, 95, 96)], NOW, EXP)).toBeNull();
        // enters and touches the stop loss in the same candle -> loss
        expect(evaluateSignal(SELL, [candle(1, 99, 103)], NOW, EXP).status).toBe('hit_sl');
    });
    test('price runs to the take profit without ever touching the entry -> not triggered, no win', () => {
        const r = evaluateSignal(SELL, [candle(1, 96, 99), candle(2, 88, 95)], NOW, EXP);
        expect(r).toEqual({ status: 'not_triggered', enteredTime: null, closedTime: at(2) });
    });
    test('candles up to and including the signal candle are ignored', () => {
        const old = { time: T0, open: 1, high: 200, low: 0, close: 1 }; // would hit everything
        const before = { time: T0 - TF, open: 1, high: 200, low: 0, close: 1 };
        expect(evaluateSignal(SELL, [before, old], NOW, EXP)).toBeNull();
    });
    test('the still-forming candle is ignored', () => {
        const now = at(2) + 100; // candle 2 is still forming
        expect(evaluateSignal(SELL, [candle(1, 99, 100.5), candle(2, 89, 95)], now, EXP)).toBeNull();
    });
    test('still waiting -> null', () => {
        expect(evaluateSignal(SELL, [candle(1, 95, 99)], at(5), EXP)).toBeNull();
    });
    test('expires after 24 hours: entered -> expired, never entered -> not_triggered', () => {
        const after = T0 + TF + DAY + 1;
        const entered = evaluateSignal(SELL, [candle(1, 99, 100.5), candle(2, 95, 99)], after, EXP);
        expect(entered.status).toBe('expired');
        expect(entered.enteredTime).toBe(at(1));
        expect(evaluateSignal(SELL, [candle(1, 95, 99)], after, EXP).status).toBe('not_triggered');
        // not yet 24h -> still open
        expect(evaluateSignal(SELL, [candle(1, 95, 99)], T0 + TF + DAY - 1, EXP)).toBeNull();
    });
    test('a result inside the window wins over expiry', () => {
        const after = T0 + TF + DAY + 1;
        const r = evaluateSignal(SELL, [candle(1, 99, 100.5), candle(2, 89, 95)], after, EXP);
        expect(r.status).toBe('hit_tp');
    });
});

describe('money', () => {
    test('a win pays stake x RR, a loss costs the stake, others are 0', () => {
        expect(resultFor('hit_tp', 9.01375, 10)).toBe(90.14);
        expect(resultFor('hit_tp', 2, 50)).toBe(100);
        expect(resultFor('hit_sl', 9, 20)).toBe(-20);
        expect(resultFor('expired', 3, 10)).toBe(0);
        expect(resultFor('not_triggered', 3, 10)).toBe(0);
    });
    test('stake settings are cleaned up', () => {
        expect(parseStakes('')).toEqual([10, 20, 50]);
        expect(parseStakes('5, 15 ,x,-3,100')).toEqual([5, 15, 100]);
        expect(parseStakes('1,2,3,4,5,6,7')).toHaveLength(5);
        expect(readResultConfig({})).toEqual({ stakes: [10, 20, 50], expirySeconds: 86400 });
        expect(readResultConfig({ RESULT_EXPIRY_HOURS: '6', RESULT_STAKES: '25' })).toEqual({ stakes: [25], expirySeconds: 21600 });
        expect(readResultConfig({ RESULT_EXPIRY_HOURS: 'x' }).expirySeconds).toBe(86400);
    });
});

describe('formatResult', () => {
    const sig = { ...SELL, rr: 9.01375, entry: 1.32643, stopLoss: 1.3270923214285715, takeProfit: 1.32046 };
    test('win message shows the three amounts', () => {
        const t = formatResult(sig, { status: 'hit_tp', enteredTime: at(1), closedTime: at(9) }, { siteUrl: 'https://x.test/signals.html' });
        expect(t).toContain('TAKE PROFIT HIT');
        expect(t).toContain('GBP/USD SELL');
        expect(t).toContain('$10 → <b>+$90.14</b>');
        expect(t).toContain('$20 → <b>+$180.28</b>');
        expect(t).toContain('$50 → <b>+$450.69</b>');
        expect(t).toContain('1 : 9.01');
        expect(t).toContain('https://x.test/signals.html');
        expect(t).toContain('not financial advice');
    });
    test('loss message shows the losses', () => {
        const t = formatResult(sig, { status: 'hit_sl', enteredTime: at(1), closedTime: at(2) }, { stakes: [10, 25] });
        expect(t).toContain('STOP LOSS HIT');
        expect(t).toContain('$10 → <b>-$10.00</b>');
        expect(t).toContain('$25 → <b>-$25.00</b>');
        expect(t).not.toContain('$50');
    });
    test('large amounts get thousands separators', () => {
        const t = formatResult({ ...sig, rr: 30 }, { status: 'hit_tp', enteredTime: at(1), closedTime: at(2) }, { stakes: [50] });
        expect(t).toContain('+$1,500.00');
    });
    test('not triggered and expired say there is no result and show no money', () => {
        const a = formatResult(sig, { status: 'not_triggered', enteredTime: null, closedTime: at(3) }, {});
        expect(a).toContain('ENTRY NOT REACHED');
        expect(a).not.toContain('If you risked');
        const b = formatResult(sig, { status: 'expired', enteredTime: at(1), closedTime: at(90) }, {});
        expect(b).toContain('EXPIRED');
        expect(b).not.toContain('If you risked');
    });
    test('text from data is escaped', () => {
        const t = formatResult({ ...sig, strategyName: 'A <b>' }, { status: 'hit_sl', enteredTime: at(1), closedTime: at(2) }, {});
        expect(t).toContain('A &lt;b&gt;');
    });
});
