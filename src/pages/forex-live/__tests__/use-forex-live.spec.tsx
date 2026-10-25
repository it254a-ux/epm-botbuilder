import { act, renderHook } from '@testing-library/react';
import { useForexLive } from '../use-forex-live';

// A fake Deriv connection: every request is answered by `answer`, and the test can push stream messages.
const mockState: { answer: (req: any) => any; listeners: Array<(m: any) => void> } = { answer: () => ({}), listeners: [] };
jest.mock('@/external/bot-skeleton/services/api/api-base', () => ({
    api_base: {
        api: {
            send: (req: any) => Promise.resolve(mockState.answer(req)),
            onMessage: () => ({
                subscribe: (fn: (m: any) => void) => {
                    mockState.listeners.push(fn);
                    return { unsubscribe: () => (mockState.listeners = mockState.listeners.filter(l => l !== fn)) };
                },
            }),
        },
    },
}));

const flushPromises = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
};

describe('useForexLive: a trade never just disappears', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockState.listeners = [];
    });
    afterEach(() => jest.useRealTimers());

    const open = { contract_type: 'MULTUP', contract_id: 11, underlying_symbol: 'frxXAUUSD', buy_price: 10, multiplier: 100, is_sold: 0, profit: 1 };

    it('lists trades that were already open when the page loaded', async () => {
        mockState.answer = req => (req.portfolio ? { portfolio: { contracts: [{ ...open, symbol: 'frxXAUUSD' }] } } : {});
        const { result } = renderHook(() => useForexLive(true, 'CR1'));
        await flushPromises();
        act(() => void jest.advanceTimersByTime(200));
        expect(result.current.positions.map(p => p.id)).toEqual([11]);
    });

    it('when Deriv no longer lists an open trade, it finds out what happened and says so in Activity', async () => {
        let listed = true;
        mockState.answer = req => {
            if (req.portfolio) return { portfolio: { contracts: listed ? [open] : [] } };
            // the live stream starts with the trade still open; a plain look-up later finds it closed
            if (req.proposal_open_contract) return { proposal_open_contract: req.subscribe || listed ? open : { ...open, is_sold: 1, profit: -10 } };
            return {};
        };
        const { result } = renderHook(() => useForexLive(true, 'CR1'));
        await flushPromises();
        act(() => void jest.advanceTimersByTime(200));
        expect(result.current.positions[0].closed).toBe(false);

        listed = false;
        await act(async () => {
            jest.advanceTimersByTime(60000);
        });
        await flushPromises();
        act(() => void jest.advanceTimersByTime(200));
        const p = result.current.positions[0];
        expect(p.closed).toBe(true);
        expect(p.closeReason).toMatch(/Stopped out/);
        expect(result.current.log[0].text).toMatch(/closed: Stopped out/);
    });

    it('every open trade gets its own live stream, and live messages move the numbers at once', async () => {
        const asked: any[] = [];
        mockState.answer = req => {
            asked.push(req);
            return req.portfolio ? { portfolio: { contracts: [open] } } : {};
        };
        const { result } = renderHook(() => useForexLive(true, 'CR1'));
        await flushPromises();
        expect(asked.filter(r => r.proposal_open_contract === 1 && r.contract_id === 11 && r.subscribe === 1)).toHaveLength(1);
        // a stream message arrives: the profit changes without any re-check
        act(() => {
            mockState.listeners.forEach(l => l({ data: { msg_type: 'proposal_open_contract', proposal_open_contract: { ...open, profit: 3.21 } } }));
            jest.advanceTimersByTime(150);
        });
        expect(result.current.positions[0].profit).toBe(3.21);
        // and its final message closes it and says why
        act(() => {
            mockState.listeners.forEach(l => l({ data: { msg_type: 'proposal_open_contract', proposal_open_contract: { ...open, is_sold: 1, profit: -10 } } }));
            jest.advanceTimersByTime(150);
        });
        expect(result.current.positions[0].closed).toBe(true);
        expect(result.current.log[0].text).toMatch(/closed: Stopped out/);
    });

    it('past closed trades are loaded again after a refresh', async () => {
        mockState.answer = req => {
            if (req.portfolio) return { portfolio: { contracts: [] } };
            if (req.profit_table) return { profit_table: { transactions: [{ contract_id: 99 }] } };
            if (req.proposal_open_contract) return { proposal_open_contract: { ...open, contract_id: 99, is_sold: 1, profit: 2.5 } };
            return {};
        };
        const { result } = renderHook(() => useForexLive(true, 'CR1'));
        await flushPromises();
        await flushPromises();
        act(() => void jest.advanceTimersByTime(200));
        expect(result.current.positions.map(p => [p.id, p.closed])).toEqual([[99, true]]);
        // old trades loaded from history do not spam the Activity list
        expect(result.current.log).toHaveLength(0);
    });
});
