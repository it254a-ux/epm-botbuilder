import { useCallback, useMemo } from 'react';
import { generateOAuthURL } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import type { AuthState, DerivAccount } from '@/external/deriv-core';

export interface UseAuthReturn {
    authState: AuthState;
    accounts: DerivAccount[];
    activeAccount: DerivAccount | null;
    activeAccountId: string | null;
    /**
     * @deprecated No longer used. dtrader no longer opens its own WebSocket —
     * it rides bot-builder's single shared connection — so there is no
     * separate OTP URL to hand it. Bot-builder's own App.tsx already handles
     * both standard OAuth (?code=) and the parent-dashboard handoff
     * (?token=&acct=) before this page ever mounts, so dtrader doesn't need
     * its own copy of that logic either. Kept only so every ported component
     * that still destructures `wsUrl` continues to compile; always `undefined`.
     */
    wsUrl: string | undefined;
    login: () => Promise<void>;
    signUp: () => Promise<void>;
    logout: () => void;
    switchAccount: (accountId: string) => Promise<void>;
    /**
     * @deprecated No longer used. Balance now comes live from bot-builder's
     * own client-store (client.balance), which is already kept up to date
     * by bot-builder's existing balance subscription — dtrader does not run
     * a second one. Calling this is a no-op, kept only so existing call
     * sites (e.g. the old deriv-ws-provider wiring) keep compiling.
     */
    updateBalance: (accountId: string, balance: string) => void;
    error: string | null;
}

/**
 * Replaces dtrader's original useAuth. dtrader previously ran its own full
 * OAuth exchange, token refresh, referral resolution, and account list,
 * entirely independent of bot-builder — including a parallel "?token=" parent
 * handoff handler duplicating one bot-builder's App.tsx already has. Per
 * product decision, all of that is now delegated to bot-builder's existing
 * auth: this hook is a thin read-only view over useStore().client and
 * useApiBase(), plus three actions (login, logout, switchAccount) that call
 * bot-builder's own existing mechanisms — the same ones the header's Sign in
 * button and AccountSwitcherModal already use.
 */
export function useAuth(): UseAuthReturn {
    const { client } = useStore();
    const { isAuthorized, isAuthorizing, accountList } = useApiBase();

    const authState: AuthState = isAuthorizing ? 'authenticating' : isAuthorized ? 'authenticated' : 'unauthenticated';

    const accounts: DerivAccount[] = useMemo(
        () =>
            (accountList ?? []).map(acc => ({
                account_id: acc.loginid,
                account_type: acc.is_virtual ? 'demo' : 'real',
                currency: acc.currency ?? client.currency,
                // Only the active account's balance is guaranteed live; other
                // accounts in the list show their last-known balance from the
                // account list itself, same as bot-builder's own header does.
                balance: acc.loginid === client.loginid ? client.balance : String(acc.balance ?? '0'),
                group: '',
                status: '',
            })),
        [accountList, client.loginid, client.balance, client.currency]
    );

    const activeAccount = accounts.find(acc => acc.account_id === client.loginid) ?? accounts[0] ?? null;

    const login = useCallback(async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) window.location.replace(oauthUrl);
    }, []);

    // Sign up currently routes through the same OAuth entry point as login —
    // bot-builder's generateOAuthURL already resolves referral/affiliate
    // params, and Deriv's OAuth page itself offers account creation from
    // there. There is no separate sign-up-only URL in bot-builder today.
    const signUp = login;

    const logout = useCallback(() => {
        client.logout();
    }, [client]);

    const switchAccount = useCallback(
        async (accountId: string) => {
            // Mirrors AccountSwitcherModal's own handleAccountSelect exactly.
            localStorage.setItem('active_loginid', accountId);
            client.checkAndRegenerateWebSocket();
        },
        [client]
    );

    const updateBalance = useCallback(() => {
        // Intentional no-op — see UseAuthReturn['updateBalance'] doc above.
    }, []);

    return {
        authState,
        accounts,
        activeAccount,
        activeAccountId: client.loginid || null,
        wsUrl: undefined,
        login,
        signUp,
        logout,
        switchAccount,
        updateBalance,
        error: null,
    };
}
