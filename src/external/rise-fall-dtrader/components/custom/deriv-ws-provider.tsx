
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useDerivWS, useBalance } from '@deriv/core';
import { useAuth } from '@/external/rise-fall-dtrader/hooks/use-auth';
import type { DerivWS } from '@deriv/core';
import type { UseAuthReturn } from '@/external/rise-fall-dtrader/hooks/use-auth';

interface DerivWSContextValue {
  ws: DerivWS | null;
  isConnected: boolean;
  isExhausted: boolean;
  auth: UseAuthReturn;
}

const DerivWSContext = createContext<DerivWSContextValue | null>(null);

/**
 * Maintains a single WebSocket connection and auth state above all page components
 * so navigation between pages (e.g. main → reports → back) does not tear down
 * and recreate the connection.
 */
export function DerivWSProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { ws, isConnected, isExhausted } = useDerivWS({
    url: auth.wsUrl,
    accountId: auth.activeAccountId ?? undefined,
  });

  // Live balance stream: subscribes once authenticated and connected, and
  // patches every update straight into auth.accounts via updateBalance.
  // This is the only change needed to make activeAccount.balance (read by
  // Header and every page) update in real time instead of only on login/
  // refresh - no other component needs to change.
  useBalance(ws, isConnected, auth.authState === 'authenticated', auth.updateBalance);

  // ── CRASH FIX: visibility-based reconnect ──────────────────────────────
  // When the browser tab is backgrounded (user switches apps on mobile), the
  // browser aggressively throttles JS timers and WebSocket pings. The Deriv
  // server drops the connection after missing several pings. When the user
  // returns, the old WS instance is dead but Flutter and the chart hooks may
  // still be holding stale references, causing "exhausted" errors and crashes.
  //
  // This effect forces a full provider remount when the tab returns from
  // background after >30 seconds. The remount creates a fresh WS connection,
  // clears any stale subscriptions, and gives every child component a clean
  // start. The 30-second threshold matches the auth hook's own reconnect logic.
  const [visibilityKey, setVisibilityKey] = useState(0);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else {
        const hiddenAt = hiddenAtRef.current;
        if (hiddenAt && Date.now() - hiddenAt > 30_000) {
          // Force a full remount of the provider and all children
          setVisibilityKey(k => k + 1);
        }
        hiddenAtRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <DerivWSContext.Provider key={visibilityKey} value={{ ws, isConnected, isExhausted, auth }}>
      {children}
    </DerivWSContext.Provider>
  );
}

export function useDerivWSContext(): DerivWSContextValue {
  const ctx = useContext(DerivWSContext);
  if (!ctx) {
    throw new Error('useDerivWSContext must be used within a DerivWSProvider');
  }
  return ctx;
}
