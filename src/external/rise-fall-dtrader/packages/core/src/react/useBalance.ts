
import { useEffect, useRef } from 'react';
import type { DerivWS } from '../ws';

interface BalanceStreamMessage {
  balance?: {
    balance: number;
    currency: string;
    loginid: string;
  };
}

/**
 * Subscribes to live balance updates over the current authenticated
 * WebSocket connection and reports each update via onBalanceUpdate.
 *
 * Mirrors the subscribe/unsubscribe lifecycle used by useTicks: subscribes
 * when ws/isConnected/isAuthenticated become ready, tears down and sends
 * forget_all on cleanup (e.g. account switch, reconnect, unmount) so the
 * server clears the stream before any re-subscribe.
 *
 * This hook does not hold balance in its own state - it reports updates
 * via a callback so the caller (useAuth, via updateBalance) remains the
 * single source of truth for account data. That keeps every existing
 * consumer of activeAccount (Header, page.tsx, etc.) working unchanged.
 */
export function useBalance(
  ws: DerivWS | null,
  isConnected: boolean,
  isAuthenticated: boolean,
  onBalanceUpdate: (loginid: string, balance: string) => void
): void {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const onBalanceUpdateRef = useRef(onBalanceUpdate);
  onBalanceUpdateRef.current = onBalanceUpdate;

  useEffect(() => {
    if (!ws || !isConnected || !isAuthenticated) return;
    let disposed = false;

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    async function subscribe() {
      const sub = await ws!.subscribe({ balance: 1 }, (data) => {
        const balance = (data as BalanceStreamMessage).balance;
        if (balance) {
          onBalanceUpdateRef.current(balance.loginid, String(balance.balance));
        }
      });

      if (disposed) {
        sub.unsubscribe();
        return;
      }
      unsubscribeRef.current = sub.unsubscribe;
    }

    subscribe().catch(() => {});

    return () => {
      disposed = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      // Send forget_all for balance so the server clears the stream before
      // the next mount (e.g. account switch) re-subscribes - prevents
      // AlreadySubscribed, same reasoning as useTicks' cleanup.
      if (ws?.isConnected) {
        ws.send({ forget_all: 'balance' }).catch(() => {});
      }
    };
  }, [ws, isConnected, isAuthenticated]);
}
