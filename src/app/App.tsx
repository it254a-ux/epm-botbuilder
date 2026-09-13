import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';
import { cleanupUrl, handleOAuthCallback } from '@/external/deriv-core';
import ChunkLoader from '@/components/loader/chunk-loader';
import LocalStorageSyncWrapper from '@/components/localStorage-sync-wrapper';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { useAccountSwitching } from '@/hooks/useAccountSwitching';
import { useLanguageFromURL } from '@/hooks/useLanguageFromURL';
import { StoreProvider } from '@/hooks/useStore';
import { isPreviewMode, PREVIEW_BASE_PATH } from '@/utils/is-preview-mode';
import { localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import i18nInstance from './i18n';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));
const DtraderPage = lazy(() => import('../pages/dtrader'));

/**
 * Component wrapper to handle language URL parameter
 * Uses the useLanguageFromURL hook to process language switching
 */
const LanguageHandler = ({ children }: { children: React.ReactNode }) => {
    useLanguageFromURL();
    return <>{children}</>;
};

// The static preview build is served under /bot/preview (see rsbuild.config.ts
// assetPrefix), so React Router must resolve routes under that prefix. Standalone
// partner deploys are served at the root, so no basename there.
const routerBasename = isPreviewMode() ? PREVIEW_BASE_PATH : undefined;

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                <Suspense
                    fallback={<ChunkLoader message={localize('Please wait while we connect to the server...')} />}
                >
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <LanguageHandler>
                            <StoreProvider>
                                <LocalStorageSyncWrapper>
                                    <RoutePromptDialog />
                                    <CoreStoreProvider>
                                        <Layout />
                                    </CoreStoreProvider>
                                </LocalStorageSyncWrapper>
                            </StoreProvider>
                        </LanguageHandler>
                    </TranslationProvider>
                </Suspense>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<AppRoot />} />
            {/* App Builder embeds the template at /preview — render the same app shell */}
            <Route path='preview' element={<AppRoot />} />
            {/* Ported Rise/Fall trading page (formerly its own repo) */}
            <Route path='dtrader' element={<DtraderPage />} />
        </Route>
    ),
    { basename: routerBasename }
);

/**
 * Main App component
 *
 * Responsibilities:
 * 1. OAuth callback handling (via vendored deriv-core handleOAuthCallback)
 * 2. Token handed off directly from the parent dashboard (executiveprimemarkets.site)
 * 3. Account switching from URL (via useAccountSwitching hook)
 * 4. Router provider setup
 */
function App() {
    // Handle account switching via URL parameter
    useAccountSwitching();

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('code')) return;

        const handleCallback = async () => {
            try {
                const authInfo = await handleOAuthCallback(window.location.href, {
                    clientId: process.env.NEXT_PUBLIC_DERIV_APP_ID || '',
                    redirectUri: window.location.origin,
                    scopes: 'trade',
                });

                const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
                const accounts = await DerivWSAccountsService.fetchAccountsList(authInfo.access_token);

                if (accounts && accounts.length > 0) {
                    DerivWSAccountsService.storeAccounts(accounts);
                    const firstAccount = accounts[0];
                    localStorage.setItem('active_loginid', firstAccount.account_id);
                    const isDemo =
                        firstAccount.account_id.startsWith('VRT') || firstAccount.account_id.startsWith('VRTC');
                    localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

                    const { api_base } = await import('@/external/bot-skeleton');
                    await api_base.init(true);
                } else {
                    console.error('No accounts returned after authentication');
                }
            } catch (error) {
                console.error('OAuth callback error:', error);
            } finally {
                cleanupUrl(window.location.origin);
            }
        };

        handleCallback();
    }, []);

    // ── Token passed directly from the parent dashboard (executiveprimemarkets.site) via ?token= ──
    // Handles both initial login and account switching (DEMO/REAL) triggered by the dashboard
    // remounting this iframe with a new ?token=&acct= URL.
    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const parentToken = urlParams.get('token');
        if (!parentToken) return;

        const handleParentToken = async () => {
            try {
                // ── Clear all stale auth data first so the old account
                // does not interfere when switching DEMO/REAL ──
                localStorage.removeItem('active_loginid');
                localStorage.removeItem('authToken');
                localStorage.removeItem('account_type');
                localStorage.removeItem('auth_info');
                localStorage.removeItem('accountsList');
                localStorage.removeItem('clientAccounts');
                localStorage.removeItem('active_account_loginid');
                sessionStorage.removeItem('deriv_accounts');

                const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
                const accounts = await DerivWSAccountsService.fetchAccountsList(parentToken);

                if (accounts && accounts.length > 0) {
                    DerivWSAccountsService.storeAccounts(accounts);

                    const requestedAcct = urlParams.get('acct');
                    const targetAccount =
                        (requestedAcct && accounts.find((a: { account_id: string }) => a.account_id === requestedAcct)) || accounts[0];

                    const isDemo =
                        targetAccount.account_id.startsWith('VRT') || targetAccount.account_id.startsWith('VRTC');

                    // ── Write all keys in one place, in the right order ──
                    localStorage.setItem('active_loginid', targetAccount.account_id);
                    localStorage.setItem('authToken', parentToken);
                    localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

                    // Store token under the key getAuthInfo() reads so getSocketURL()
                    // can fetch an authenticated WebSocket URL with a valid app_id
                    localStorage.setItem('auth_info', JSON.stringify({
                        access_token: parentToken,
                        expires_at: Math.floor(Date.now() / 1000) + 3600,
                    }));

                    // Store accounts in sessionStorage so authorizeAndSubscribe()
                    // can build the full account list after WebSocket connects
                    sessionStorage.setItem('deriv_accounts', JSON.stringify(accounts));

                    const { api_base } = await import('@/external/bot-skeleton');
                    await api_base.init(true);
                } else {
                    console.error('No accounts returned for parent token');
                }
            } catch (error) {
                console.error('Parent token login error:', error);
            } finally {
                // Clean token from URL without a reload
                urlParams.delete('token');
                urlParams.delete('acct');
                const newUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
                window.history.replaceState({}, '', newUrl);
            }
        };

        handleParentToken();
    }, []);

    return <RouterProvider router={router} />;
}

export default App;
