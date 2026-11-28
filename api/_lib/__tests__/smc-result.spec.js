/** @jest-environment node */
const { evaluateTrade, formatTpHit, checkTrades } = require('../smc-result');

const sell = { key: 'k', symbol: 'frxEURUSD', symbolName: 'EUR/USD', side: 'SELL', tf: 900, entry: 100, takeProfit: 99.5, multiplier: 100, tpMultiple: 0.5, entryTime: 1000 };
const buy = { ...sell, side: 'BUY', takeProfit: 100.5 };
const c = (time, high, low) => ({ time, open: 100, high, low, close: 100 });

describe('Smart Money take profit', () => {
    test('a SELL reaches 0.5x stake when price falls 0.5%', () => {
        expect(evaluateTrade(sell, [c(1060, 100.1, 99.9), c(1120, 100, 99.4)], 1200, 99999)).toEqual({ status: 'hit_tp', time: 1120 });
    });
    test('a BUY reaches it when price rises 0.5%', () => {
        expect(evaluateTrade(buy, [c(1060, 100.2, 99.9), c(1120, 100.6, 100)], 1200, 99999)).toEqual({ status: 'hit_tp', time: 1120 });
    });
    test('the entry candle itself is not counted', () => {
        expect(evaluateTrade(sell, [c(1000, 100, 99)], 1100, 99999)).toBeNull();
    });
    test('a whole stake against first closes the trade quietly', () => {
        expect(evaluateTrade(sell, [c(1060, 101.2, 99.9)], 1100, 99999).status).toBe('stopped');
    });
    test('still open and then expired', () => {
        expect(evaluateTrade(sell, [c(1060, 100.1, 99.9)], 1100, 99999)).toBeNull();
        expect(evaluateTrade(sell, [c(1060, 100.1, 99.9)], 200000, 3600).status).toBe('expired');
    });
    test('the message shows $5 for a $10 stake', () => {
        const text = formatTpHit(sell, 1120, { stakes: [10, 20] });
        expect(text).toContain('TAKE PROFIT HIT');
        expect(text).toContain('$10 stake → <b>+$5</b>');
        expect(text).toContain('$20 stake → <b>+$10</b>');
    });
    test('checkTrades sends one message and not a second one', async () => {
        const rows = [{ key: 'k', symbol: 'frxEURUSD', symbol_name: 'EUR/USD', side: 'SELL', tf: 900, entry: 100, take_profit: 99.5, multiplier: 100, tp_multiple: 0.5, entry_time: 1000, status: 'open', hit_time: null, result_sent: false }];
        const sql = (strings, ...vals) => {
            const q = strings.join('?');
            if (/CREATE TABLE/i.test(q)) return Promise.resolve([]);
            if (/WHERE status = 'hit_tp'/i.test(q)) return Promise.resolve(rows.filter(r => r.status === 'hit_tp' && !r.result_sent));
            if (/WHERE status = 'open' ORDER/i.test(q)) return Promise.resolve(rows.filter(r => r.status === 'open'));
            if (/SET status/i.test(q)) {
                const r = rows.find(x => x.key === vals[2] && x.status === 'open');
                if (!r) return Promise.resolve([]);
                r.status = vals[0];
                r.hit_time = vals[1];
                return Promise.resolve([{ key: r.key }]);
            }
            if (/SET result_sent/i.test(q)) {
                rows.find(x => x.key === vals[0]).result_sent = true;
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        };
        const sent = [];
        const opts = { getM1: async () => [c(1120, 100, 99.4)], send: async t => sent.push(t), now: 1200, stakes: [10], expirySeconds: 99999 };
        const r1 = await checkTrades(sql, opts);
        const r2 = await checkTrades(sql, opts);
        expect(r1.sent).toBe(1);
        expect(r2.sent).toBe(0);
        expect(sent).toHaveLength(1);
    });
});
