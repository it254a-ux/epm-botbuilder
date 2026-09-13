import { forwardRef, useState } from 'react';
import { cn } from '@/external/rise-fall-dtrader/lib/utils';
import { TradeTypesFlyout } from './trade-types-flyout';
import type { AuthState, DerivAccount, DerivWS } from '@deriv/core';
interface HeaderProps {
  authState: AuthState;
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  onLogin: () => Promise<void>;
  onLogout: () => void;
  onSwitchAccount: (accountId: string) => Promise<void>;
  onSignUp?: () => Promise<void>;
  logoSrc?: string;
  appName?: string;
  activeTradeType?: string;
  onSelectTradeType?: (type: string) => void;
  /** No longer used for account matching (see FORCED_REAL_LABEL_ACCOUNT_IDS
   * below) — kept optional here only so existing callers passing these
   * through don't need to be touched again. */
  ws?: DerivWS | null;
  isConnected?: boolean;
}
function AccountLabel({ type }: { type: 'demo' | 'real' }) {
  return (
    <span
      className={cn(
        'text-xs font-medium',
        type === 'demo' ? 'text-orange-500' : 'text-emerald-600'
      )}
    >
      {type === 'demo' ? 'Demo account' : 'Real account'}
    </span>
  );
}
/**
 * Both account IDs (real + demo) belonging to the one login that should
 * always display as "Real account" regardless of which of its two
 * accounts is actually active. Matched by account_id rather than email —
 * this app's /accounts response and its WS connection do not expose an
 * email field at all (get_settings is rejected by this WS endpoint with
 * "UnrecognisedRequest"), so ID is the only reliable identifier available.
 * The balance value shown is always the true value for whichever of the
 * two accounts is active — only the label is forced.
 */
const FORCED_REAL_LABEL_ACCOUNT_IDS = ['DOT94283012'];
function LiveBalanceDisplay({ activeAccount }: { activeAccount: DerivAccount | null }) {
  if (!activeAccount) return null;
  const balance = Number(activeAccount.balance);
  const currency = activeAccount.currency;
  const isReal = activeAccount.account_type === 'real';
  const forceRealLabel = FORCED_REAL_LABEL_ACCOUNT_IDS.includes(activeAccount.account_id);

  const formattedBalance = balance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="flex flex-col items-end leading-tight">
      <AccountLabel type={forceRealLabel ? 'real' : isReal ? 'real' : 'demo'} />
      <span className="text-xs font-medium">
        {formattedBalance} {currency}
      </span>
    </div>
  );
}
// FIX: Header now forwards its ref to the actual <header> DOM element.
// This lets page.tsx measure the header's real rendered height (via
// ResizeObserver) and use that exact number for the content spacer below
// it, instead of a manually guessed pixel value that goes stale every
// time the header's padding changes.
export const Header = forwardRef<HTMLElement, HeaderProps>(function Header({
  authState,
  accounts,
  activeAccount,
  onLogin,
  onLogout,
  onSwitchAccount,
  onSignUp,
  logoSrc,
  appName,
  activeTradeType = 'rise-fall',
  onSelectTradeType,
}, ref) {
  const [logoError, setLogoError] = useState(false);
  const logoLetter = (appName ?? process.env.NEXT_PUBLIC_DERIV_APP_NAME ?? 'Deriv Trading')
    .trim()
    .charAt(0)
    .toUpperCase() || 'D';
  return (
    <header
      ref={ref}
      className="fixed top-0 left-0 lg:left-[72px] right-0 z-50 flex items-center justify-between px-4 pt-3 pb-1 border-b bg-background/80 backdrop-blur-sm"
    >
      {/* FIX (mobile only): the top TradeTypesFlyout tab row was overlapping
          the chart on mobile, and now duplicates the "Market contracts"
          menu in the trade panel below the chart. Hidden on mobile with
          max-lg:hidden per explicit confirmation; desktop is unchanged and
          still shows the tab row exactly as before. */}
      <div className="flex items-center gap-3 max-lg:hidden">
        <TradeTypesFlyout
          activeTradeType={activeTradeType}
          onSelectTradeType={onSelectTradeType ?? (() => {})}
        />
      </div>
      {/* FIX (mobile only): with the flyout hidden on mobile, this balance
          display becomes the only child in the justify-between header —
          and a lone flex child sits at the main-start (left) regardless of
          justify-between. max-lg:ml-auto pushes it back to the end (right)
          on mobile, which is where it belongs. Desktop is untouched: that
          class only applies below the lg breakpoint, and on desktop the
          flyout (left) + this balance div (right) already sit correctly
          via justify-between on their own. */}
      <div className="flex items-center gap-3 max-lg:ml-auto">
        {authState === 'authenticated' && <LiveBalanceDisplay activeAccount={activeAccount} />}
      </div>
    </header>
  );
});
