import { useEffect, useMemo, useState } from 'react';
import { CONNECTION_STATUS, connectionStatus$ } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { createApiWsHandle, type ApiWsHandle } from '@/external/rise-fall-dtrader/lib/api-ws-adapter';

interface UseDerivWSReturn {
    ws: ApiWsHandle | null;
    isConnected: boolean;
    isExhausted: boolean;
    error: string | null;
}

/**
 * Replaces dtrader's original useDerivWS. Per product decision, dtrader does
 * not open its own WebSocket — it always rides bot-builder's single shared
 * connection (api_base), which is already established by the rest of the
 * app before this page ever mounts.
 *
 * `isExhausted` and `error` are kept in the return shape so every ported
 * component that destructures them keeps compiling, but bot-builder's own
 * api_base already owns reconnection — this hook just reflects its state,
 * it doesn't reconnect anything itself.
 */
export function useDerivWS(): UseDerivWSReturn {
    const ws = useMemo(() => createApiWsHandle(), []);
    const [isConnected, setIsConnected] = useState(connectionStatus$.getValue() === CONNECTION_STATUS.OPENED);

    useEffect(() => {
        const sub = connectionStatus$.subscribe(status => {
            setIsConnected(status === CONNECTION_STATUS.OPENED);
        });
        return () => sub.unsubscribe();
    }, []);

    return { ws, isConnected, isExhausted: false, error: null };
}
