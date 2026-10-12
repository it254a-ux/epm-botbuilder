import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './risk-disclaimer.scss';

// Module-level (not storage): resets on every page load/refresh, but stays
// dismissed while the person navigates inside the app.
let dismissed = false;

/**
 * Risk disclaimer shown on every page load/refresh, as the first thing on landing.
 * Not shown on the OAuth callback page, and not again after "Okay"
 * until the page is refreshed.
 */
const RiskDisclaimer = () => {
    const [open, setOpen] = useState(() => window.location.pathname !== '/callback' && !dismissed);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
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
                    <svg viewBox='0 0 24 24' width='34' height='34' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
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

export default RiskDisclaimer;
