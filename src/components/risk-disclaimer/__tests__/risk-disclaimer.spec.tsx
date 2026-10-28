import { act, render, screen } from '@testing-library/react';
import RiskDisclaimer, { resetRiskDisclaimerForTests } from '../index';

// The card appears half a second after the page is ready, and closes by itself after 3 seconds or on any touch / click.
const setup = () => {
    render(<RiskDisclaimer />);
};

beforeEach(() => {
    resetRiskDisclaimerForTests();
    jest.useFakeTimers();
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
});
afterEach(() => jest.useRealTimers());

test('shows after half a second', () => {
    setup();
    act(() => jest.advanceTimersByTime(400));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => jest.advanceTimersByTime(400));
    expect(screen.getByRole('dialog')).toBeTruthy();
});

test('closes by itself 3 seconds after it appears', () => {
    setup();
    act(() => jest.advanceTimersByTime(800));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1500));
    expect(screen.queryByRole('dialog')).toBeNull();
});

test('closes when the person touches or clicks anywhere', () => {
    setup();
    act(() => jest.advanceTimersByTime(800));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => jest.advanceTimersByTime(400)); // the tap guard (0.3 s) is over
    act(() => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
});
