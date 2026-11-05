import { act, fireEvent, render, screen } from '@testing-library/react';

let tickHandler: (d: unknown) => void = () => undefined;
const mockSocket = { ws: {}, isConnected: true };
jest.mock('@deriv/core', () => ({ useDerivWS: () => mockSocket }), { virtual: true });
jest.mock('../tick-feed', () => ({
    watchTicks: (_ws: unknown, _s: string, h: (d: unknown) => void) => {
        tickHandler = h;
        return () => undefined;
    },
}));
jest.mock('../sweep-sniper.scss', () => ({}));

import SweepSniper from '../sweep-sniper';

const tick = (quote: number) => act(() => tickHandler({ tick: { quote, pip_size: 2 } }));

describe('Sweep Sniper', () => {
    const setup = (levels = { sell: 4068.63, buy: 4000 }) => {
        const onTrigger = jest.fn();
        render(<SweepSniper symbol='frxXAUUSD' currency='USD' levels={levels} onTrigger={onTrigger} disabled={false} />);
        fireEvent.click(screen.getByText('Sweep Sniper', { selector: '.sniper__name' }));
        return onTrigger;
    };

    it('shows the levels with the market\'s own number of decimals', () => {
        setup({ sell: 4068.1894642857146, buy: 4000 });
        tick(4060.5);
        expect(screen.getByText('4068.19')).toBeTruthy();
    });

    it('does nothing until armed, then opens the chosen number of SELL trades when price reaches the Sell SL line', () => {
        const onTrigger = setup();
        tick(4060.5);
        fireEvent.click(screen.getByText('3'));
        fireEvent.change(screen.getAllByPlaceholderText('Off')[0], { target: { value: '5' } });
        tick(4069); // above the line, but the sniper is not armed yet
        expect(onTrigger).not.toHaveBeenCalled();

        tick(4060.5);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4068); // still below the line
        expect(onTrigger).not.toHaveBeenCalled();
        tick(4068.7); // a wick through the line
        expect(onTrigger).toHaveBeenCalledTimes(1);
        expect(onTrigger).toHaveBeenCalledWith('SELL', { count: 3, takeProfit: 5, stopLoss: null });
        expect(screen.getByText('✓ Fired')).toBeTruthy();
        tick(4070); // each side fires once
        expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    it('opens BUY trades when price falls to the Buy SL line, and a level the price had already passed is not watched', () => {
        const onTrigger = setup({ sell: 4050, buy: 4000 }); // the Sell level is already below the price
        tick(4060);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4070); // above the passed Sell level: nothing
        expect(onTrigger).not.toHaveBeenCalled();
        tick(3999.9);
        expect(onTrigger).toHaveBeenCalledWith('BUY', { count: 1, takeProfit: null, stopLoss: null });
    });

    it('can be disarmed', () => {
        const onTrigger = setup();
        tick(4060);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        fireEvent.click(screen.getByText('Disarm Sniper'));
        tick(4100);
        expect(onTrigger).not.toHaveBeenCalled();
    });
});
