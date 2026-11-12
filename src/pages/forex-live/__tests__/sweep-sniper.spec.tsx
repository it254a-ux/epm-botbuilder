import type { ComponentProps } from 'react';
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
    beforeEach(() => localStorage.clear());

    const setup = (levels = { sell: 4068.63, buy: 4000 }) => {
        const onTrigger = jest.fn();
        render(<SweepSniper symbol='frxXAUUSD' currency='USD' levels={levels} onTrigger={onTrigger} disabled={false} />);
        fireEvent.click(screen.getByText('Sniper', { selector: '.sniper__name' }));
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
        fireEvent.change(screen.getByPlaceholderText('Trade panel stake'), { target: { value: '12' } });
        tick(4069); // above the line, but the sniper is not armed yet
        expect(onTrigger).not.toHaveBeenCalled();

        tick(4060.5);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4068); // still below the line
        expect(onTrigger).not.toHaveBeenCalled();
        tick(4068.7); // a wick through the line
        expect(onTrigger).toHaveBeenCalledTimes(1);
        expect(onTrigger).toHaveBeenCalledWith('SELL', { count: 3, stake: 12, takeProfit: 5, stopLoss: null });
        expect(screen.getByText('✓ Fired')).toBeTruthy();
        tick(4070); // each side fires once
        expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    it('a Sell line the price is already above is touched on the way back down; a BUY line on the way down', () => {
        const onTrigger = setup({ sell: 4050, buy: 4000 }); // the Sell line is already below the price
        tick(4060);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4070); // moving away from both lines: nothing
        expect(onTrigger).not.toHaveBeenCalled();
        tick(4049.9); // back down through the Sell line
        expect(onTrigger).toHaveBeenCalledWith('SELL', { count: 1, stake: null, takeProfit: null, stopLoss: null });
        tick(3999.9);
        expect(onTrigger).toHaveBeenCalledWith('BUY', { count: 1, stake: null, takeProfit: null, stopLoss: null });
    });

    it('can be disarmed', () => {
        const onTrigger = setup();
        tick(4060);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        fireEvent.click(screen.getByText('Disarm Sniper'));
        tick(4100);
        expect(onTrigger).not.toHaveBeenCalled();
    });

    it('follows the chart line while armed: when the analysis moves the line, the new price is the one watched', () => {
        const onTrigger = jest.fn();
        const el = (levels: { sell: number | null; buy: number | null }) => (
            <SweepSniper symbol='frxXAUUSD' currency='USD' levels={levels} onTrigger={onTrigger} disabled={false} />
        );
        const { rerender } = render(el({ sell: 4130, buy: null }));
        fireEvent.click(screen.getByText('Sniper', { selector: '.sniper__name' }));
        tick(4100);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        rerender(el({ sell: 4110, buy: null })); // the line moved down to 4110
        tick(4105);
        expect(onTrigger).not.toHaveBeenCalled();
        tick(4110.2); // the old locked price (4130) is far away, the new line is touched
        expect(onTrigger).toHaveBeenCalledWith('SELL', expect.anything());
    });

    it('after a page refresh it keeps its settings but stays OFF and never trades until you arm it', () => {
        // even a sniper that was left armed (an old save, or armed when the page closed) must not switch itself on
        localStorage.setItem(
            'epm_sweep_sniper_v1',
            JSON.stringify({ symbol: 'frxXAUUSD', count: 4, stake: '15', tp: '8', sl: '', on: true, fired: [], savedAt: Date.now() - 60_000 })
        );
        const onTrigger = jest.fn();
        render(<SweepSniper symbol='frxXAUUSD' currency='USD' levels={{ sell: 4130, buy: 4000 }} onTrigger={onTrigger} disabled={false} />);
        tick(4100);
        expect(document.querySelector('.sniper__trigger')?.getAttribute('data-state')).toBe('off');
        fireEvent.click(screen.getByText('Sniper', { selector: '.sniper__name' }));
        expect((screen.getByDisplayValue('15') as HTMLInputElement).value).toBe('15'); // the settings are still remembered
        expect(screen.getByText(/Arm Sniper/)).toBeTruthy();
        tick(4131); // price touches the Sell SL line, but the sniper was never turned on
        tick(3990);
        expect(onTrigger).not.toHaveBeenCalled();
        // and once you do arm it, it works as normal
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4131);
        expect(onTrigger).toHaveBeenCalledWith('SELL', { count: 4, stake: 15, takeProfit: 8, stopLoss: null });
    });

    it('never saves the armed state, so a refresh can not switch it on', () => {
        const onTrigger = setup({ sell: 4130, buy: 4000 });
        tick(4100);
        fireEvent.click(screen.getByText(/Arm Sniper/));
        expect(JSON.parse(localStorage.getItem('epm_sweep_sniper_v1') ?? '{}').on).toBe(false);
        expect(onTrigger).not.toHaveBeenCalled();
    });

    it('Breakout mode trades through the line: BUY when the Sell SL breaks, SELL when the Buy SL breaks', () => {
        const onTrigger = setup({ sell: 4130, buy: 4090 });
        tick(4100);
        fireEvent.click(screen.getByText('Breakout'));
        expect(screen.getByText(/Trades through the line/)).toBeTruthy();
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4130.5); // the Sell SL line breaks upward
        expect(onTrigger).toHaveBeenCalledTimes(1);
        expect(onTrigger).toHaveBeenLastCalledWith('BUY', { count: 1, stake: null, takeProfit: null, stopLoss: null });
        tick(4089.5); // the Buy SL line breaks downward
        expect(onTrigger).toHaveBeenLastCalledWith('SELL', { count: 1, stake: null, takeProfit: null, stopLoss: null });
        expect(onTrigger).toHaveBeenCalledTimes(2);
    });

    it('the mode is remembered across a refresh', () => {
        localStorage.setItem('epm_sweep_sniper_v1', JSON.stringify({ symbol: 'frxXAUUSD', count: 1, stake: '', tp: '', sl: '', on: false, mode: 'breakout', fired: [], savedAt: Date.now() }));
        render(<SweepSniper symbol='frxXAUUSD' currency='USD' levels={{ sell: 4130, buy: 4000 }} onTrigger={jest.fn()} disabled={false} />);
        fireEvent.click(screen.getByText('Sniper', { selector: '.sniper__name' }));
        expect(screen.getByText('Breakout').getAttribute('aria-checked')).toBe('true');
    });
});

describe('Sweep Sniper: My target', () => {
    beforeEach(() => localStorage.clear());

    const element = (props: Partial<ComponentProps<typeof SweepSniper>> = {}, symbol = 'frxXAUUSD') => (
        <SweepSniper symbol={symbol} currency='USD' levels={{ sell: null, buy: null }} onTrigger={jest.fn()} disabled={false} {...props} />
    );
    const openPanel = (props: Partial<ComponentProps<typeof SweepSniper>> = {}) => {
        const onTrigger = jest.fn();
        const onTargetLine = jest.fn();
        const view = render(element({ onTrigger, onTargetLine, ...props }));
        fireEvent.click(screen.getByText('Sniper', { selector: '.sniper__name' }));
        return { onTrigger, onTargetLine, ...view };
    };
    const setTarget = (v: string) => fireEvent.change(screen.getByLabelText('Target price'), { target: { value: v } });

    it('can be armed with only a target, and opens a BUY when price climbs to it (once)', () => {
        const { onTrigger } = openPanel();
        tick(4060);
        setTarget('4075');
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4070);
        expect(onTrigger).not.toHaveBeenCalled();
        tick(4075.2); // a wick through the target
        expect(onTrigger).toHaveBeenCalledTimes(1);
        expect(onTrigger).toHaveBeenCalledWith('BUY', { count: 1, stake: null, takeProfit: null, stopLoss: null });
        expect(screen.getByText('✓ BUY opened')).toBeTruthy();
        tick(4090); // a target fires once
        expect(onTrigger).toHaveBeenCalledTimes(1);
    });

    it('a SELL target below the price opens a SELL when price falls to it', () => {
        const { onTrigger } = openPanel();
        tick(4060);
        setTarget('4050');
        fireEvent.click(screen.getByRole('radio', { name: 'Sell' }));
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4055);
        expect(onTrigger).not.toHaveBeenCalled();
        tick(4049.9);
        expect(onTrigger).toHaveBeenCalledWith('SELL', { count: 1, stake: null, takeProfit: null, stopLoss: null });
    });

    it('uses the trades per trigger, stake and total take profit set in the panel', () => {
        const { onTrigger } = openPanel();
        tick(4060);
        setTarget('4075');
        fireEvent.click(screen.getByText('3'));
        fireEvent.change(screen.getByPlaceholderText('Trade panel stake'), { target: { value: '12' } });
        fireEvent.change(screen.getAllByPlaceholderText('Off')[0], { target: { value: '5' } });
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4076);
        expect(onTrigger).toHaveBeenCalledWith('BUY', { count: 3, stake: 12, takeProfit: 5, stopLoss: null });
    });

    it('never trades while the sniper is off, even when the price reaches the target', () => {
        const { onTrigger } = openPanel();
        tick(4060);
        setTarget('4075');
        tick(4080);
        tick(4040);
        expect(onTrigger).not.toHaveBeenCalled();
    });

    it('can be disarmed before the target is reached', () => {
        const { onTrigger } = openPanel();
        tick(4060);
        setTarget('4075');
        fireEvent.click(screen.getByText(/Arm Sniper/));
        fireEvent.click(screen.getByText('Disarm Sniper'));
        tick(4080);
        expect(onTrigger).not.toHaveBeenCalled();
    });

    it('shows its line on the chart, and takes it off once it has fired', () => {
        const { onTargetLine } = openPanel();
        tick(4060);
        setTarget('4075');
        expect(onTargetLine).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'sniper-target', title: 'TARGET BUY', price: 4075 }));
        fireEvent.click(screen.getByText(/Arm Sniper/));
        tick(4076);
        expect(onTargetLine).toHaveBeenLastCalledWith(null);
    });

    it('Mark waits for a click on the chart and puts that price in the box', () => {
        let finish: (p: number | null) => void = () => undefined;
        const cancel = jest.fn();
        const pickPrice = jest.fn((cb: (p: number | null) => void) => {
            finish = cb;
            return cancel;
        });
        openPanel({ pickPrice });
        tick(4060);
        fireEvent.click(screen.getByText('Mark'));
        expect(pickPrice).toHaveBeenCalledTimes(1);
        act(() => finish(4071.2345));
        expect((screen.getByLabelText('Target price') as HTMLInputElement).value).toBe('4071.23');
        // Esc on the chart (no price) leaves what is in the box alone
        fireEvent.click(screen.getByText('Mark'));
        act(() => finish(null));
        expect((screen.getByLabelText('Target price') as HTMLInputElement).value).toBe('4071.23');
    });

    it('has no Mark button to press when the page gives no chart to click', () => {
        openPanel();
        expect((screen.getByText('Mark').closest('button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('a target belongs to one market: changing market clears it and switches the sniper off', () => {
        const onTrigger = jest.fn();
        const { rerender } = render(element({ onTrigger }));
        fireEvent.click(screen.getByText('Sniper', { selector: '.sniper__name' }));
        tick(4060);
        setTarget('4075');
        fireEvent.click(screen.getByText(/Arm Sniper/));
        rerender(element({ onTrigger }, 'frxEURUSD'));
        expect((screen.getByLabelText('Target price') as HTMLInputElement).value).toBe('');
        expect(document.querySelector('.sniper__trigger')?.getAttribute('data-state')).toBe('off');
    });
});
