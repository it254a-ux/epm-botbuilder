import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './risk-disclaimer.scss';

const STORAGE_KEY = 'epm_risk_disclaimer_seen';

const alreadySeen = () => {
    try {
        return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

/**
 * Risk disclaimer shown once per visit, as the first thing on landing.
 * Not shown on the OAuth callback page, and not again after "Okay"
 * (until the browser tab/session is closed).
 */
const RiskDisclaimer = () => {
    const [open, setOpen] = useState(() => window.location.pathname !== '/callback' && !alreadySeen());

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
        try {
            sessionStorage.setItem(STORAGE_KEY, '1');
        } catch {
            /* ignore */
        }
        setOpen(false);
    };

    if (!open) return null;

    return createPortal(
        <div className='epm-risk-disclaimer' role='dialog' aria-modal='true' aria-labelledby='epm-risk-title'>
            <div className='epm-risk-disclaimer__card'>
                <h2 id='epm-risk-title' className='epm-risk-disclaimer__title'>
                    Risk disclaimer
                </h2>
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
