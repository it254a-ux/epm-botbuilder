import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './risk-disclaimer.scss';

// Module-level (not storage): resets on every page load/refresh, but stays
// dismissed while the person navigates inside the app.
let dismissed = false;

/** The card closes by itself after this long. */
const AUTO_CLOSE_MS = 10000;

/**
 * Risk disclaimer shown on every page load/refresh, half a second after the dashboard is fully loaded and stable.
 * It closes by itself after 10 seconds, or at once when the person touches, clicks or types anywhere.
 * Not shown on the OAuth callback page, and not again after "Okay"
 * until the page is refreshed.
 */
const RiskDisclaimer = () => {
    const [open, setOpen] = useState(false);

    // Wait until the app has fully loaded and the page has been visible and
    // stable (no loading screen anywhere) for half a second, then show the popup.
    useEffect(() => {
        if (dismissed || window.location.pathname === '/callback') return;
        const STABLE_MS = 500;
        const TICK_MS = 200;
        const MAX_WAIT_MS = 25000;
        const isLoading = () =>
            document.readyState !== 'complete' ||
            !!document.querySelector('.load-message, .chunk-loader, .epm-splash, .epm-splash-root');
        let stable = 0;
        let waited = 0;
        const id = window.setInterval(() => {
            waited += TICK_MS;
            stable = isLoading() ? 0 : stable + TICK_MS;
            if (stable >= STABLE_MS || waited >= MAX_WAIT_MS) {
                window.clearInterval(id);
                if (!dismissed) setOpen(true);
            }
        }, TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        // closes by itself after 10 seconds, or as soon as the person touches, clicks or types anywhere
        const timer = window.setTimeout(close, AUTO_CLOSE_MS);
        const any = () => close();
        // a short moment first, so the tap that was already in progress when the card appeared does not close it unseen
        const arm = window.setTimeout(() => {
            window.addEventListener('pointerdown', any, true);
            window.addEventListener('touchstart', any, true);
            window.addEventListener('keydown', any, true);
        }, 300);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.clearTimeout(timer);
            window.clearTimeout(arm);
            window.removeEventListener('pointerdown', any, true);
            window.removeEventListener('touchstart', any, true);
            window.removeEventListener('keydown', any, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const close = () => {
        dismissed = true;
        setOpen(false);
    };

    if (!open) return null;

    return createPortal(
        <div className='epm-risk-disclaimer' role='dialog' aria-modal='true' aria-labelledby='epm-risk-title'>
            <div className='epm-risk-disclaimer__card'>
                <div className='epm-risk-disclaimer__glow' aria-hidden='true' />
                <div className='epm-risk-disclaimer__icon' aria-hidden='true'>
                    <svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z' />
                        <path d='M12 8v5' />
                        <circle cx='12' cy='16.2' r='0.6' fill='currentColor' />
                    </svg>
                </div>
                <h2 id='epm-risk-title' className='epm-risk-disclaimer__title'>
                    Risk disclaimer
                </h2>
                <div className='epm-risk-disclaimer__rule' aria-hidden='true' />
                <p className='epm-risk-disclaimer__text'>
                    Deriv offers complex products, including options and CFDs, which carry significant risks. Trading
                    CFDs involves leverage, which can amplify both profits and losses, potentially leading to the loss
                    of your entire investment. Trade only with money you can afford to lose and never borrow to trade.
                    Understand the risks before trading.
                </p>
                <button type='button' className='epm-risk-disclaimer__btn' onClick={close} autoFocus>
                    Okay
                </button>
            </div>
        </div>,
        document.body
    );
};

/** For tests only: forget that the card was closed. */
export const resetRiskDisclaimerForTests = () => {
    dismissed = false;
};

export default RiskDisclaimer;
