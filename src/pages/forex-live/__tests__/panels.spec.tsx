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
