import {
    buildBuyRequest,
    buildSellRequest,
    errorText,
    FALLBACK_MULTIPLIERS,
    formatMoney,
    mergePosition,
    parseMinStake,
    pickToClose,
    readMultipliers,
    summarize,
    toPosition,
    validateTrade,
    type Position,
    type TradeInput,
} from '../trade-engine';

const base: TradeInput = { side: 'BUY', symbol: 'frxEURUSD', stake: 10, multiplier: 100, currency: 'USD' };

const pos = (over: Partial<Position>): Position => ({
    id: 1,
    symbol: 'frxEURUSD',
    side: 'BUY',
    stake: 10,
    multiplier: 100,
    profit: 0,
    entry: null,
    spot: null,
    stopLoss: null,
    takeProfit: null,
    openedAt: 1,
    currency: 'USD',
    closed: false,
    result: null,
    canClose: true,
    ...over,
});

describe('buildBuyRequest', () => {
    it('opens a BUY as MULTUP with no expiry and the stake as the price', () => {
        const r = buildBuyRequest(base);
        expect(r).toEqual({
            buy: '1',
            price: 10,
            parameters: { contract_type: 'MULTUP', underlying_symbol: 'frxEURUSD', currency: 'USD', basis: 'stake', amount: 10, multiplier: 100 },
        });
        // a multiplier has no fixed time: nothing about duration or expiry may be sent
        expect(JSON.stringify(r)).not.toMatch(/duration|expiry/);
    });

    it('opens a SELL as MULTDOWN', () => {
        expect(buildBuyRequest({ ...base, side: 'SELL' }).parameters.contract_type).toBe('MULTDOWN');
    });

    it('adds stop loss and take profit only when given', () => {
        expect(buildBuyRequest(base).parameters.limit_order).toBeUndefined();
        expect(buildBuyRequest({ ...base, stopLoss: 4, takeProfit: 12.5 }).parameters.limit_order).toEqual({ stop_loss: 4, take_profit: 12.5 });
        expect(buildBuyRequest({ ...base, stopLoss: null, takeProfit: 5 }).parameters.limit_order).toEqual({ take_profit: 5 });
    });

    it('rounds money to cents', () => {
        const r = buildBuyRequest({ ...base, stake: 10.456 });
        expect(r.price).toBe(10.46);
        expect(r.parameters.amount).toBe(10.46);
    });
});

describe('validateTrade', () => {
    it('accepts a normal trade', () => expect(validateTrade(base)).toBeNull());
    it.each([
        [{ symbol: '' }, /market/i],
        [{ currency: '' }, /account/i],
        [{ stake: 0 }, /stake/i],
        [{ stake: NaN }, /stake/i],
        [{ multiplier: 0 }, /multiplier/i],
        [{ stopLoss: 0 }, /stop loss/i],
        [{ takeProfit: -3 }, /take profit/i],
        [{ stopLoss: 10 }, /less than the stake/i],
    ])('refuses %j', (over, text) => {
        expect(validateTrade({ ...base, ...over } as TradeInput)).toMatch(text as RegExp);
    });
});

describe('buildSellRequest', () => {
    it('closes at the market price', () => expect(buildSellRequest(77)).toEqual({ sell: 77, price: 0 }));
});

describe('toPosition', () => {
    const raw = {
        contract_id: 123,
        contract_type: 'MULTDOWN',
        underlying_symbol: 'frxGBPUSD',
        buy_price: '5.00',
        profit: '1.25',
        multiplier: 200,
        entry_spot: '1.3000',
        current_spot: '1.2990',
        purchase_time: 1700000000,
        is_sold: 0,
        is_valid_to_sell: 1,
        currency: 'USD',
        limit_order: { stop_loss: { order_amount: -2 }, take_profit: { order_amount: 6 } },
    };

    it('reads an open multiplier', () => {
        expect(toPosition(raw)).toMatchObject({
            id: 123,
            symbol: 'frxGBPUSD',
            side: 'SELL',
            stake: 5,
            profit: 1.25,
            multiplier: 200,
            entry: 1.3,
            spot: 1.299,
            stopLoss: -2,
            takeProfit: 6,
            closed: false,
            canClose: true,
        });
    });

    it('ignores anything that is not a multiplier (bot trades)', () => {
        expect(toPosition({ ...raw, contract_type: 'DIGITOVER' })).toBeNull();
        expect(toPosition(null)).toBeNull();
        expect(toPosition({ contract_type: 'MULTUP' })).toBeNull();
    });

    it('marks a sold trade as closed with its result', () => {
        const p = toPosition({ ...raw, is_sold: 1, profit: -2, status: 'sold' })!;
        expect(p.closed).toBe(true);
        expect(p.result).toBe(-2);
        expect(p.canClose).toBe(false);
    });

    it('accepts the older field names', () => {
        expect(toPosition({ contract_id: 5, contract_type: 'MULTUP', underlying: 'frxEURUSD', buy_price: 1, entry_tick: 1.1 })).toMatchObject({
            symbol: 'frxEURUSD',
            side: 'BUY',
            entry: 1.1,
        });
    });
});

describe('mergePosition', () => {
    it('keeps numbers a later message does not carry', () => {
        const merged = mergePosition(pos({ entry: 1.1, profit: 2 }), pos({ entry: null, profit: null }));
        expect(merged.entry).toBe(1.1);
        expect(merged.profit).toBe(2);
    });
    it('takes the newest values', () => {
        expect(mergePosition(pos({ profit: 1 }), pos({ profit: 3 })).profit).toBe(3);
    });
});

describe('summarize and pickToClose', () => {
    const list = [
        pos({ id: 1, side: 'BUY', profit: 2 }),
        pos({ id: 2, side: 'BUY', profit: -1 }),
        pos({ id: 3, side: 'SELL', profit: 0.5, symbol: 'frxGBPUSD' }),
        pos({ id: 4, side: 'SELL', profit: -3 }),
        pos({ id: 5, closed: true, profit: 9 }),
    ];

    it('adds up only open trades', () => {
        expect(summarize(list)).toEqual({ open: 4, buys: 2, sells: 2, stake: 40, profit: -1.5, winning: 2, losing: 2 });
    });

    it('picks what each close button means', () => {
        const ids = (f: Parameters<typeof pickToClose>[1], s?: string) => pickToClose(list, f, s).map(p => p.id);
        expect(ids('all')).toEqual([1, 2, 3, 4]);
        expect(ids('buy')).toEqual([1, 2]);
        expect(ids('sell')).toEqual([3, 4]);
        expect(ids('winning')).toEqual([1, 3]);
        expect(ids('losing')).toEqual([2, 4]);
        expect(ids('all', 'frxGBPUSD')).toEqual([3]);
    });

    it('never tries to close a trade Deriv says cannot be closed', () => {
        expect(pickToClose([pos({ id: 1, canClose: false })], 'all')).toEqual([]);
    });
});

describe('readMultipliers', () => {
    it('reads the multiplier range from contracts_for', () => {
        const answer = {
            contracts_for: {
                available: [
                    { contract_category: 'callput', contract_type: 'CALL' },
                    { contract_category: 'multiplier', contract_type: 'MULTUP', multiplier_range: [100, 30, 50] },
                    { contract_category: 'multiplier', contract_type: 'MULTDOWN', multiplier_range: [30, 50, 100, 200] },
                ],
            },
        };
        expect(readMultipliers(answer)).toEqual([30, 50, 100, 200]);
    });
    it('falls back to a usable list', () => {
        expect(readMultipliers(null)).toEqual(FALLBACK_MULTIPLIERS);
        expect(readMultipliers({ contracts_for: { available: [] } })).toEqual(FALLBACK_MULTIPLIERS);
    });
});

describe('errorText and formatMoney', () => {
    it('finds a readable message in any shape', () => {
        expect(errorText({ error: { message: 'Insufficient balance.' } })).toBe('Insufficient balance.');
        expect(errorText(new Error('boom'))).toBe('boom');
        expect(errorText('plain')).toBe('plain');
        expect(errorText(undefined)).toMatch(/try again/i);
    });
    it('formats profit and loss with a sign', () => {
        expect(formatMoney(1.5)).toBe('+1.50');
        expect(formatMoney(-2)).toBe('-2.00');
        expect(formatMoney(0)).toBe('0.00');
        expect(formatMoney(null)).toBe('—');
        expect(formatMoney(3, 'USD')).toBe('+3.00 USD');
    });
});

describe('parseMinStake', () => {
    it('reads the minimum out of Deriv\'s message', () => {
        expect(parseMinStake('Enter an amount equal to or higher than 1.64.')).toBe(1.64);
        expect(parseMinStake('Minimum stake of 0.35 USD')).toBe(0.35);
    });
    it('returns null when there is no minimum in the message', () => {
        expect(parseMinStake('Please specify either payout or stake.')).toBeNull();
        expect(parseMinStake('')).toBeNull();
    });
});

describe('explainRefusal', () => {
    const { explainRefusal } = require('../trade-engine');
    const msg = 'Enter an amount equal to or higher than 1.51.';
    it('blames the stake only when the minimum is above it', () => {
        const r = explainRefusal(msg, { stake: 1, stopLoss: null, takeProfit: null });
        expect(r.minStake).toBe(1.51);
        expect(r.text).toMatch(/smallest stake/);
    });
    it('does not blame a 25 stake for a 1.51 limit; points at stop loss / take profit', () => {
        const r = explainRefusal(msg, { stake: 25, stopLoss: 1, takeProfit: 1 });
        expect(r.minStake).toBeNull();
        expect(r.text).toMatch(/stop loss \/ take profit/);
        expect(r.text).toContain(msg);
    });
    it('passes other messages through', () => {
        expect(explainRefusal('Market is closed.', { stake: 25 }).text).toBe('Market is closed.');
    });
});

describe('positionLines', () => {
    const { positionLines, toPosition } = require('../trade-engine');
    const raw = (o: any) => ({ contract_type: 'MULTUP', contract_id: 1, underlying_symbol: 'frxEURUSD', buy_price: 10, entry_spot: 1.1, profit: 0.5, ...o });
    it('draws an entry line with live profit, and SL/TP levels when known', () => {
        const p = toPosition(raw({ limit_order: { stop_loss: { order_amount: -2, value: '1.09' }, take_profit: { order_amount: 3, value: '1.12' } } }));
        const l = positionLines([p], 'frxEURUSD');
        expect(l.map((x: any) => x.price)).toEqual([1.1, 1.09, 1.12]);
        expect(l[0].title).toBe('BUY +0.50');
    });
    it('skips closed trades, other markets and trades without an entry yet', () => {
        const closed = toPosition(raw({ is_sold: 1 }));
        const other = toPosition(raw({ contract_id: 2, underlying_symbol: 'frxGBPUSD' }));
        const noEntry = toPosition(raw({ contract_id: 3, entry_spot: undefined }));
        expect(positionLines([closed, other, noEntry], 'frxEURUSD')).toEqual([]);
    });
});

describe('amountsFromPlan', () => {
    const { amountsFromPlan } = require('../trade-engine');
    it('turns plan prices into money amounts for a BUY', () => {
        // stake 10 x100 = exposure 1000; stop 0.1% away loses 1.00, target 0.3% away wins 3.00
        const a = amountsFromPlan({ side: 'BUY', entry: 1, stopLoss: 0.999, takeProfit: 1.003 }, 'BUY', 10, 100);
        expect(a).toEqual({ stopLoss: 1, takeProfit: 3 });
    });
    it('works for a SELL', () => {
        const a = amountsFromPlan({ side: 'SELL', entry: 1, stopLoss: 1.001, takeProfit: 0.997 }, 'SELL', 10, 100);
        expect(a).toEqual({ stopLoss: 1, takeProfit: 3 });
    });
    it('keeps the stop under the stake', () => {
        const a = amountsFromPlan({ side: 'BUY', entry: 1, stopLoss: 0.9, takeProfit: 1.1 }, 'BUY', 10, 100);
        expect(a!.stopLoss).toBe(9.99);
    });
    it('is null for the other side, no plan, or wrong-way levels', () => {
        expect(amountsFromPlan({ side: 'BUY', entry: 1, stopLoss: 0.99, takeProfit: 1.01 }, 'SELL', 10, 100)).toBeNull();
        expect(amountsFromPlan(null, 'BUY', 10, 100)).toBeNull();
        expect(amountsFromPlan({ side: 'BUY', entry: 1, stopLoss: 1.01, takeProfit: 1.02 }, 'BUY', 10, 100)).toBeNull();
    });
});


describe('why a trade closed', () => {
    const base = { contract_type: 'MULTUP', contract_id: 7, underlying_symbol: 'R_100', buy_price: 10, multiplier: 100 };

    it('says take profit, stop loss, stop out or plain closed from the final numbers', () => {
        const tp = toPosition({ ...base, is_sold: 1, profit: 5, limit_order: { take_profit: { order_amount: 5 } } });
        expect(tp?.closeReason).toBe('Take profit reached');
        const sl = toPosition({ ...base, is_sold: 1, profit: -3, limit_order: { stop_loss: { order_amount: -3 } } });
        expect(sl?.closeReason).toBe('Stop loss reached');
        const out = toPosition({ ...base, is_sold: 1, profit: -10 });
        expect(out?.closeReason).toBe('Stopped out: the whole stake was lost');
        const plain = toPosition({ ...base, is_sold: 1, profit: 1.2 });
        expect(plain?.closeReason).toBe('Closed');
    });

    it('an open trade has no close reason, and a later message keeps the reason it was given', () => {
        expect(toPosition({ ...base, is_sold: 0, profit: 1 })?.closeReason).toBeUndefined();
        const closed = toPosition({ ...base, is_sold: 1, profit: -10 })!;
        const merged = mergePosition(closed, { ...closed, closeReason: undefined });
        expect(merged.closeReason).toBe('Stopped out: the whole stake was lost');
    });
});
