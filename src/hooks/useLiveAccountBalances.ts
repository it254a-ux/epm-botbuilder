import { useEffect, useState } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from './useApiBase';

/**
 * Live balances of EVERY account (not just the active one), for the account dropdown.
 * It asks Deriv for a live "all accounts" balance stream and keeps the latest amount per account.
 * If Deriv refuses that stream the list is simply empty and the dropdown keeps the amounts it already had.
 * The header balance does not use this: it keeps using the active account's own live balance.
 */
export const useLiveAccountBalances = (): Record<string, number> => {
    const { isAuthorized, activeLoginid } = useApiBase();
    const [balances, setBalances] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!isAuthorized) return undefined;
        const api = api_base.api as any;
        if (!api) return undefined;

        const sub = api.onMessage?.().subscribe((res: any) => {
            const data = res?.data;
            const accounts = data?.msg_type === 'balance' ? data?.balance?.accounts : null;
            if (!accounts || typeof accounts !== 'object') return;
            const next: Record<string, number> = {};
            Object.keys(accounts).forEach(id => {
                const amount = accounts[id]?.balance;
                if (typeof amount === 'number') next[id] = amount;
            });
            setBalances(prev => ({ ...prev, ...next }));
        });
        try {
            Promise.resolve(api.send({ balance: 1, account: 'all', subscribe: 1 })).catch(() => {});
        } catch {
            /* not available: the dropdown keeps its old amounts */
        }
        return () => sub?.unsubscribe?.();
    }, [isAuthorized, activeLoginid]);

    return balances;
};
