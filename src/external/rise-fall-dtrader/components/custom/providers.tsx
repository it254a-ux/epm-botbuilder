import { ThemeProvider } from 'next-themes';
import { ThemeBridge } from './theme-bridge';

// Avoids a flash of the wrong theme on mount: theme-bridge.tsx's effect only
// syncs after the first paint, so without this, dtrader would briefly show
// next-themes' hardcoded default before catching up to bot-builder's actual
// theme. Reading the DOM class directly here (rather than useThemeSwitcher)
// keeps this component synchronous — it runs before React context/hooks are
// available. Falls back to 'light' on the separate standalone /dtrader
// route, where bot-builder's own theme class is never set.
function getInitialTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.body.classList.contains('theme--dark') ? 'dark' : 'light';
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme={getInitialTheme()} disableTransitionOnChange>
      <ThemeBridge />
      {children}
    </ThemeProvider>
  );
}
