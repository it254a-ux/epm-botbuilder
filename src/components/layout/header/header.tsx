import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useLogout } from '@/hooks/useLogout';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import MenuItems from './menu-items';
import MobileMenu from './mobile-menu';
import './header.scss';

/**
 * AppHeader — embedded partner variant
 *
 * When Bot Builder runs inside the Executive Prime Markets dashboard iframe,
 * the parent dashboard owns all auth (login / logout / account switching).
 * This header therefore:
 *  - Shows a display-only balance badge when the user is authenticated,
 *    read directly from the `authorize` response (authData) rather than
 *    the MobX `client` store — the client store's balance/all_accounts_balance
 *    fields are never populated when auth happens via the parent-supplied
 *    token flow instead of Bot Builder's native OAuth/subscribe flow.
 *  - Hides Login, Sign up, Logout, and Transfer buttons entirely
 *  - Keeps the logo, desktop menu items, and mobile hamburger menu
 */
const AppHeader = observer(() => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, activeLoginid, authData } = useApiBase();
    const { client } = useStore() ?? {};
    const is_account_regenerating = client?.is_account_regenerating || false;

    const handleLogout = useLogout();

    // Detect whether we are still in the middle of token-based auth
    // (token param present in URL means App.tsx is still processing it)
    const [isTokenPending, setIsTokenPending] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return Boolean(params.get('token'));
    });

    // Clear pending flag once activeLoginid is set (auth succeeded)
    useEffect(() => {
        if (!isTokenPending) return;
        if (activeLoginid) {
            setIsTokenPending(false);
            return;
        }
        // Safety net: give up after 15 s
        const timer = setTimeout(() => setIsTokenPending(false), 15_000);
        return () => clearTimeout(timer);
    }, [isTokenPending, activeLoginid]);

    const renderAccountSection = useCallback(() => {
        // Authenticated — show display-only balance badge (no logout/transfer)
        // Read balance/currency/is_virtual straight from the authorize
        // response (authData) — this is populated as soon as the WebSocket
        // authorizes, independent of the MobX client store.
        if (activeLoginid && !is_account_regenerating && authData) {
            const isDemo = authData.is_virtual === 1;

            const balance = typeof authData.balance === 'number'
                ? authData.balance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                  })
                : '0.00';

            const currency = authData.currency || 'USD';

            return (
                <div className='auth-actions'>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(201,168,76,0.35)',
                            background: 'rgba(201,168,76,0.06)',
                        }}
                    >
                        <span
                            style={{
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: isDemo
                                    ? 'rgba(201,168,76,0.18)'
                                    : 'rgba(76,201,120,0.18)',
                                color: isDemo ? '#c9a84c' : '#4cc978',
                            }}
                        >
                            {isDemo ? 'DEMO' : 'REAL'}
                        </span>
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>
                            {balance} {currency}
                        </span>
                    </div>
                </div>
            );
        }

        // Still loading / authorizing — show a small spinner
        if (isAuthorizing || isTokenPending) {
            return (
                <div className='auth-actions auth-actions--loading'>
                    <svg
                        className='auth-actions__spinner'
                        viewBox='0 0 24 24'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                    >
                        <circle
                            cx='12'
                            cy='12'
                            r='10'
                            stroke='currentColor'
                            strokeWidth='2.5'
                            strokeLinecap='round'
                            strokeDasharray='31.416'
                            strokeDashoffset='10'
                        />
                    </svg>
                </div>
            );
        }

        // Not authenticated and not loading — show nothing
        // (Login/Signup are handled by the parent dashboard)
        return null;
    }, [
        isAuthorizing,
        isTokenPending,
        isDesktop,
        activeLoginid,
        authData,
        is_account_regenerating,
    ]);

    if (client?.should_hide_header) return null;

    return (
        <>
            <Header
                className={clsx('app-header', {
                    'app-header--desktop': isDesktop,
                    'app-header--mobile': !isDesktop,
                })}
            >
                <Wrapper variant='left'>
                    <MobileMenu onLogout={handleLogout} />
                    <AppLogo />
                    {isDesktop && <MenuItems />}
                </Wrapper>
                <Wrapper variant='right'>
                    {renderAccountSection()}
                </Wrapper>
            </Header>
        </>
    );
});

export default AppHeader;
