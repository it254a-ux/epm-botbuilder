import { useEffect, useMemo } from 'react';
import { Home, Clock, FileText, LifeBuoy, Globe, CircleUserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/external/rise-fall-dtrader/lib/utils';
import { useTheme } from 'next-themes';
interface NavItem {
  label: string;
  icon: LucideIcon;
}
const TOP_ITEMS: NavItem[] = [
  { label: 'Home', icon: Home },
  { label: 'Positions', icon: Clock },
  { label: 'Reports', icon: FileText },
];
const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Help', icon: LifeBuoy },
  { label: 'Language', icon: Globe },
];

// Theme sync protocol shared with the outer shell (executive-prime-market-app).
// This app has no theme toggle of its own anymore — it asks its parent
// window for the current theme on load, then listens for live updates
// whenever the outer app's toggle is clicked.
const THEME_REQUEST_MSG = 'epm-theme-request';
const THEME_UPDATE_MSG = 'epm-theme-update';

/**
 * Left-side vertical navigation rail. Matches the reference screenshot:
 * Home / Positions / Reports, a divider, then Help / Language / Account —
 * each icon stacked above its label.
 *
 * Pure navigation/display component. `onNavigate` is a placeholder callback
 * left for you to wire up to actual routing/panels — nothing here touches
 * auth state, accounts, or login/logout.
 *
 * Theme is no longer controlled locally: when embedded in the
 * executive-prime-market-app shell, this component receives theme updates
 * from the parent window's single theme toggle via postMessage. If loaded
 * standalone (no parent, e.g. local dev), it simply falls back to whatever
 * next-themes resolves on its own (system/localStorage).
 */
export function Sidebar({ onNavigate }: { onNavigate?: (label: string) => void }) {
  const { setTheme } = useTheme();

  // The outer shell's origin, derived from document.referrer at mount time
  // (set by the browser to the parent page's URL when embedded cross-origin).
  // Falls back to '*' when there's no referrer, e.g. when this app is opened
  // directly and not inside an iframe.
  const parentOrigin = useMemo(() => {
    if (typeof document === 'undefined' || !document.referrer) return '*';
    try {
      return new URL(document.referrer).origin;
    } catch {
      return '*';
    }
  }, []);

  useEffect(() => {
    function handleThemeMessage(event: MessageEvent) {
      if (parentOrigin !== '*' && event.origin !== parentOrigin) return;
      if (event.data?.type !== THEME_UPDATE_MSG) return;
      if (event.data.theme === 'light' || event.data.theme === 'dark') {
        setTheme(event.data.theme);
      }
    }
    window.addEventListener('message', handleThemeMessage);

    // Ask the parent shell what the current theme is right away, in case
    // this app loaded after the shell already had a theme set.
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: THEME_REQUEST_MSG }, parentOrigin);
    }

    return () => window.removeEventListener('message', handleThemeMessage);
  }, [setTheme, parentOrigin]);

  return (
    <nav className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-[72px] flex-col items-center gap-7 bg-[#0e0e0e] pt-6 border-r border-white/5">
      {TOP_ITEMS.map(({ label, icon: Icon }) => (
        <button
          key={label}
          onClick={() => onNavigate?.(label)}
          className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon size={20} strokeWidth={1.75} />
          <span className="text-[11px] font-medium leading-none">{label}</span>
        </button>
      ))}
      <div className="w-8 border-t border-white/10" />
      {BOTTOM_ITEMS.map(({ label, icon: Icon }) => (
        <button
          key={label}
          onClick={() => onNavigate?.(label)}
          className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon size={20} strokeWidth={1.75} />
          <span className="text-[11px] font-medium leading-none">{label}</span>
        </button>
      ))}
      <button
        onClick={() => onNavigate?.('Account')}
        className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <CircleUserRound size={20} strokeWidth={1.75} />
        <span className="text-[11px] font-medium leading-none">Account</span>
      </button>
    </nav>
  );
}
