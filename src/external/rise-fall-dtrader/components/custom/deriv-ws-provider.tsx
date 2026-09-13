import { createContext, useContext } from 'react';
import { useDerivWS } from '@/external/rise-fall-dtrader/hooks/use-deriv-ws';
import { useAuth } from '@/external/rise-fall-dtrader/hooks/use-auth';
import type { ApiWsHandle as DerivWS } from '@/external/rise-fall-dtrader/lib/api-ws-adapter';
import type { UseAuthReturn } from '@/external/rise-fall-dtrader/hooks/use-auth';

interface DerivWSContextValue {
  ws: DerivWS | null;
  isConnected: boolean;
  isExhausted: boolean;
  auth: UseAuthReturn;
}

const DerivWSContext = createContext<DerivWSContextValue | null>(null);

/**
 * Bot-builder already establishes and maintains its own single WebSocket
 * connection (api_base) before this page ever mounts, and already owns
 * reconnection/visibility handling for it (see api-base.ts's own
 * checkAndRegenerateWebSocket / reconnect logic). This provider no longer
 * opens a second connection, runs its own balance subscription, or drives
 * its own visibility-based remount — it just exposes bot-builder's existing
 * connection (via useDerivWS) and auth state (via useAuth) to the rest of
 * the ported dtrader tree, unchanged from how every component here already
 * consumes them.
 */
export function DerivWSProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { ws, isConnected, isExhausted } = useDerivWS();

  return (
    <DerivWSContext.Provider value={{ ws, isConnected, isExhausted, auth }}>
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
