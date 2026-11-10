import { act, fireEvent, render, screen } from '@testing-library/react';

const series = () => ({ setData: jest.fn(), update: jest.fn(), createPriceLine: jest.fn(), removePriceLine: jest.fn() });
jest.mock('lightweight-charts', () => ({
    LineStyle: { Dashed: 2 },
    createChart: () => ({
        addCandlestickSeries: series,
        addLineSeries: series,
        applyOptions: jest.fn(),
        remove: jest.fn(),
        timeScale: () => ({
            fitContent: jest.fn(),
            setVisibleLogicalRange: jest.fn(),
            subscribeVisibleLogicalRangeChange: jest.fn(),
            unsubscribeVisibleLogicalRangeChange: jest.fn(),
        }),
    }),
}));
// the market data feed answers with no candles, so the page only has its own controls to show
jest.mock(
    '@deriv/core',
    () => ({
        DerivWS: class {
            connect = () => Promise.resolve();
            send = () => Promise.resolve({ candles: [] });
            disconnect = () => undefined;
        },
    }),
    { virtual: true }
);
jest.mock('../market-forecast.scss', () => ({}));

import MarketForecast from '../market-forecast';

class FakeResizeObserver {
    observe() {}
    disconnect() {}
}

describe('Market Forecast stays off until you run it', () => {
    const realFetch = global.fetch;
    beforeEach(() => {
        (global as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    });
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('never calls the forecast service when the page opens or the market / candle size / look-ahead is changed', async () => {
        render(<MarketForecast />);
        await act(async () => {
            await new Promise(r => setTimeout(r, 30));
        });
        expect(global.fetch).not.toHaveBeenCalled();
        const [market, size, ahead] = screen.getAllByRole('combobox') as HTMLSelectElement[];
        fireEvent.change(size, { target: { value: size.options[1].value } });
        fireEvent.change(ahead, { target: { value: ahead.options[0].value } });
        fireEvent.change(market, { target: { value: market.options[1].value } });
        await act(async () => {
            await new Promise(r => setTimeout(r, 30));
        });
        expect(global.fetch).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /Run forecast/i })).toBeTruthy();
    });
});
