import { fireEvent, render, screen } from '@testing-library/react';
import PositionsPanel from '../positions-panel';
import type { Position, TradeInput } from '../trade-engine';
import TradePanel from '../trade-panel';

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

describe('TradePanel', () => {
    beforeEach(() => localStorage.clear());

    const setup = (disabled = false) => {
        const onTrade = jest.fn();
        render(<TradePanel symbol='frxEURUSD' currency='USD' multipliers={[30, 100, 200]} disabled={disabled} pending={0} onTrade={onTrade} />);
        return onTrade;
    };

    it('opens a BUY the moment the button is pressed, with no confirmation step', () => {
        const onTrade = setup();
        fireEvent.click(screen.getByRole('button', { name: /BUY/ }));
        expect(onTrade).toHaveBeenCalledTimes(1);
        const [trades] = onTrade.mock.calls[0] as [TradeInput[]];
        expect(trades).toHaveLength(1);
        expect(trades[0]).toMatchObject({ side: 'BUY', symbol: 'frxEURUSD', stake: 1, multiplier: 100, currency: 'USD', stopLoss: null, takeProfit: null });
    });

    it('opens a SELL, and repeated presses each send their own trade', () => {
        const onTrade = setup();
        const sell = screen.getByRole('button', { name: /SELL/ });
        fireEvent.click(sell);
        fireEvent.click(sell);
        fireEvent.click(sell);
        expect(onTrade).toHaveBeenCalledTimes(3);
        expect((onTrade.mock.calls[2][0] as TradeInput[])[0].side).toBe('SELL');
    });

    it('sends several identical trades at once when "trades per click" is raised', () => {
        const onTrade = setup();
        fireEvent.change(screen.getByLabelText(/Trades per click/i), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: /BUY/ }));
        expect(onTrade.mock.calls[0][0]).toHaveLength(5);
    });

    it('a stop loss that is not below the stake never blocks the trade: it is sent without one, with a note', () => {
        const onTrade = setup();
        fireEvent.change(screen.getByLabelText(/^Stop loss/), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: /^BUY/ }));
        expect(onTrade).toHaveBeenCalledTimes(1);
        expect((onTrade.mock.calls[0][0] as TradeInput[])[0].stopLoss).toBeNull();
        expect(screen.getByRole('alert').textContent).toMatch(/Stop loss ignored/);
    });

    it('an empty stop loss box sends no stop loss at all', () => {
        const onTrade = setup();
        fireEvent.click(screen.getByRole('button', { name: /^SELL/ }));
        expect((onTrade.mock.calls[0][0] as TradeInput[])[0].stopLoss).toBeNull();
    });

    it('passes stake, stop loss and take profit through', () => {
        const onTrade = setup();
        fireEvent.change(screen.getByLabelText(/^Stake/), { target: { value: '25' } });
        fireEvent.change(screen.getByLabelText(/^Stop loss/), { target: { value: '5' } });
        fireEvent.change(screen.getByLabelText(/^Take profit/), { target: { value: '12' } });
        fireEvent.click(screen.getByRole('button', { name: /SELL/ }));
        expect((onTrade.mock.calls[0][0] as TradeInput[])[0]).toMatchObject({ stake: 25, stopLoss: 5, takeProfit: 12 });
    });

    it('does nothing while not logged in', () => {
        const onTrade = setup(true);
        fireEvent.click(screen.getByRole('button', { name: /BUY/ }));
        expect(onTrade).not.toHaveBeenCalled();
    });
});

describe('TradePanel: market info, minimum stake and market-change notice', () => {
    beforeEach(() => localStorage.clear());
    const base = { symbol: '1HZ75V', currency: 'USD', multipliers: [10, 20, 50], disabled: false, pending: 0 };

    it('shows the market name, the contract type and the smallest stake', () => {
        render(<TradePanel {...base} onTrade={jest.fn()} marketName='Volatility 75 (1s) Index' minStake={1.64} />);
        expect(screen.getByText(/Trade Volatility 75 \(1s\) Index/)).toBeInTheDocument();
        expect(screen.getByText(/Multiplier x/)).toBeInTheDocument();
        expect(screen.getByText('Min stake 1.64 USD')).toBeInTheDocument();
    });

    it('fills the stake box with the smallest stake Deriv accepts and says so, so the click is not refused', () => {
        const onTrade = jest.fn();
        render(<TradePanel {...base} onTrade={onTrade} marketName='Vol 75' minStake={1.64} />);
        expect(screen.getByLabelText(/^Stake/)).toHaveValue(1.64);
        expect(screen.getByRole('alert')).toHaveTextContent(/Stake set to 1.64/);
        fireEvent.click(screen.getByRole('button', { name: /BUY/ }));
        expect((onTrade.mock.calls[0][0] as TradeInput[])[0].stake).toBe(1.64);
    });

    it('the person can clear the box and type any amount, and it is not overwritten', () => {
        const onTrade = jest.fn();
        render(<TradePanel {...base} onTrade={onTrade} minStake={1.64} />);
        const box = screen.getByLabelText(/^Stake/);
        fireEvent.change(box, { target: { value: '' } });
        expect(box).toHaveValue(null); // really empty
        fireEvent.change(box, { target: { value: '25' } });
        expect(box).toHaveValue(25);
        fireEvent.click(screen.getByRole('button', { name: /BUY/ }));
        expect((onTrade.mock.calls[0][0] as TradeInput[])[0].stake).toBe(25);
    });

    it('a stake chosen on a market comes back when returning to it; a new market starts at its own minimum', () => {
        const { rerender } = render(<TradePanel {...base} onTrade={jest.fn()} minStake={1.64} />);
        fireEvent.change(screen.getByLabelText(/^Stake/), { target: { value: '25' } });
        rerender(<TradePanel {...base} symbol='R_100' onTrade={jest.fn()} minStake={0.35} />);
        expect(screen.getByLabelText(/^Stake/)).toHaveValue(0.35);
        rerender(<TradePanel {...base} onTrade={jest.fn()} minStake={1.64} />);
        expect(screen.getByLabelText(/^Stake/)).toHaveValue(25);
    });

    it('does not send a trade whose typed stake is below the minimum', () => {
        const onTrade = jest.fn();
        render(<TradePanel {...base} onTrade={onTrade} minStake={1.64} />);
        fireEvent.change(screen.getByLabelText(/^Stake/), { target: { value: '0.5' } });
        fireEvent.click(screen.getByRole('button', { name: /SELL/ }));
        expect(onTrade).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent(/smallest stake on this market is 1.64/);
    });

    it('shows the notice when the market changed', () => {
        render(<TradePanel {...base} onTrade={jest.fn()} notice='Market changed to Vol 75. Trades now open on this market.' />);
        expect(screen.getByRole('status')).toHaveTextContent(/Market changed to Vol 75/);
    });

    it('shows the contracts open on this market, or says there are none', () => {
        const { rerender } = render(<TradePanel {...base} onTrade={jest.fn()} openHere={{ count: 0, buys: 0, sells: 0, profit: 0 }} />);
        expect(screen.getByText('No contracts open here')).toBeInTheDocument();
        rerender(<TradePanel {...base} onTrade={jest.fn()} openHere={{ count: 3, buys: 2, sells: 1, profit: 0.31 }} />);
        expect(screen.getByText('3 open here · ▲2 ▼1 · +0.31')).toBeInTheDocument();
    });

    it('tells the page which multiplier is chosen', () => {
        const onMultiplier = jest.fn();
        render(<TradePanel {...base} onTrade={jest.fn()} onMultiplier={onMultiplier} />);
        expect(onMultiplier).toHaveBeenCalled();
    });
});

describe('PositionsPanel', () => {
    const list = [
        pos({ id: 1, side: 'BUY', profit: 2 }),
        pos({ id: 2, side: 'SELL', profit: -1 }),
        pos({ id: 3, side: 'BUY', profit: -4, symbol: 'frxGBPUSD' }),
        pos({ id: 4, closed: true, result: 3, canClose: false }),
    ];

    it('shows the open count and total profit or loss', () => {
        render(<PositionsPanel positions={list} currency='USD' symbol='frxEURUSD' onClose={jest.fn()} />);
        expect(screen.getByText('Open').nextSibling).toHaveTextContent('3');
        expect(screen.getByText('-3.00')).toBeInTheDocument();
    });

    it('"Close all" closes every open trade at once', () => {
        const onClose = jest.fn();
        render(<PositionsPanel positions={list} currency='USD' symbol='frxEURUSD' onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /^Close all/ }));
        expect((onClose.mock.calls[0][0] as Position[]).map(p => p.id)).toEqual([1, 2, 3]);
    });

    it('the Buys / Sells / Winners / Losers buttons only change the list, they never close a trade', () => {
        const onClose = jest.fn();
        render(<PositionsPanel positions={list} currency='USD' symbol='frxEURUSD' onClose={onClose} />);
        for (const label of [/^Buys/, /^Sells/, /^Winners/, /^Losers/, /^All/]) fireEvent.click(screen.getByRole('button', { name: label }));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('a chosen list shows only its trades, and the red button closes exactly those', () => {
        const onClose = jest.fn();
        render(<PositionsPanel positions={list} currency='USD' symbol='frxEURUSD' onClose={onClose} />);
        const closeShown = (pick: RegExp, close: RegExp) => {
            onClose.mockClear();
            fireEvent.click(screen.getByRole('button', { name: pick }));
            fireEvent.click(screen.getByRole('button', { name: close }));
            return (onClose.mock.calls[0][0] as Position[]).map(p => p.id);
        };
        expect(closeShown(/^Buys/, /^Close buys/)).toEqual([1, 3]);
        expect(closeShown(/^Sells/, /^Close sells/)).toEqual([2]);
        expect(closeShown(/^Winners/, /^Close winners/)).toEqual([1]);
        expect(closeShown(/^Losers/, /^Close losers/)).toEqual([2, 3]);
    });

    it('closes a single trade from its own button', () => {
        const onClose = jest.fn();
        render(<PositionsPanel positions={list} currency='USD' symbol='frxEURUSD' onClose={onClose} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]);
        expect((onClose.mock.calls[0][0] as Position[]).map(p => p.id)).toEqual([2]);
    });

    it('a trade that is already closing is shown as Closing and is not closed again by the red button', () => {
        const onClose = jest.fn();
        const busy = [pos({ id: 1, closing: true, canClose: false }), pos({ id: 2 })];
        render(<PositionsPanel positions={busy} currency='USD' symbol='frxEURUSD' onClose={onClose} />);
        expect(screen.getByRole('button', { name: 'Closing…' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /^Close all/ }));
        expect((onClose.mock.calls[0][0] as Position[]).map(p => p.id)).toEqual([2]);
    });

    it('"This market only" limits the close button to the market on the chart', () => {
        const onClose = jest.fn();
        render(<PositionsPanel positions={list} currency='USD' symbol='frxEURUSD' onClose={onClose} />);
        fireEvent.click(screen.getByLabelText(/This market only/i));
        fireEvent.click(screen.getByRole('button', { name: /^Close all/ }));
        expect((onClose.mock.calls[0][0] as Position[]).map(p => p.id)).toEqual([1, 2]);
    });

    it('closed trades show WIN or LOSS with the profit or loss of each, and the total', () => {
        const done = [
            pos({ id: 10, closed: true, canClose: false, result: 3.25 }),
            pos({ id: 11, side: 'SELL', closed: true, canClose: false, result: -1.5 }),
        ];
        render(<PositionsPanel positions={done} currency='USD' symbol='frxEURUSD' onClose={jest.fn()} />);
        expect(screen.getByText('WIN')).toBeInTheDocument();
        expect(screen.getByText('LOSS')).toBeInTheDocument();
        expect(screen.getByText('+3.25')).toBeInTheDocument();
        expect(screen.getByText('-1.50')).toBeInTheDocument();
        expect(screen.getByText('+1.75 USD')).toBeInTheDocument(); // net of the two
    });

    it('says so when nothing is open', () => {
        render(<PositionsPanel positions={[]} currency='USD' symbol='frxEURUSD' onClose={jest.fn()} />);
        expect(screen.getByText(/No open trades/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull();
    });
});
