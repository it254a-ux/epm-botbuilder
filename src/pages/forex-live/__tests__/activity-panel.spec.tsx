import { render, screen } from '@testing-library/react';
import ActivityPanel from '../activity-panel';
import type { Position } from '../trade-engine';

const pos = (over: Partial<Position>): Position => ({
    id: 1,
    symbol: 'frxXAUUSD',
    side: 'BUY',
    stake: 10,
    multiplier: 100,
    profit: 1.5,
    entry: 2000,
    spot: 2001,
    stopLoss: null,
    takeProfit: null,
    openedAt: 1,
    currency: 'USD',
    closed: false,
    result: null,
    canClose: true,
    ...over,
});

describe('ActivityPanel', () => {
    it('shows a live line for every open trade with its profit, and a LIVE badge with the age of the last message', () => {
        render(
            <ActivityPanel
                positions={[pos({}), pos({ id: 2, side: 'SELL', symbol: 'R_100', profit: -0.75 }), pos({ id: 3, closed: true })]}
                log={[]}
                currency='USD'
                streamAt={10_000}
                now={() => 10_400}
            />
        );
        const live = screen.getByLabelText('Open trades, live');
        expect(live.textContent).toContain('XAUUSD');
        expect(live.textContent).toContain('+1.50 USD');
        expect(live.textContent).toContain('R_100');
        expect(live.textContent).toContain('-0.75 USD');
        expect(live.querySelectorAll('li')).toHaveLength(2); // the closed one is not listed as live
        expect(screen.getByText(/LIVE · 0\.4s/)).toBeTruthy();
    });

    it('says syncing, not LIVE, when trades are open but nothing has arrived for a while', () => {
        render(<ActivityPanel positions={[pos({})]} log={[]} currency='USD' streamAt={1_000} now={() => 30_000} />);
        expect(screen.getByText(/syncing/)).toBeTruthy();
    });

    it('lists what happened below, and explains itself when there is nothing yet', () => {
        const { rerender } = render(<ActivityPanel positions={[]} log={[]} currency='USD' streamAt={0} />);
        expect(screen.getByText(/show up here as they happen/)).toBeTruthy();
        rerender(<ActivityPanel positions={[]} log={[{ id: 1, at: 1, kind: 'ok', text: 'BUY XAUUSD opened' }]} currency='USD' streamAt={0} />);
        expect(screen.getByText('BUY XAUUSD opened')).toBeTruthy();
    });
});
