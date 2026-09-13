
import { useEffect } from 'react';
import { useTheme } from 'next-themes';

// Message protocol shared with the main shell (executive-prime-market-app).
// Keep these strings in sync with THEME_REQUEST_MSG / THEME_UPDATE_MSG there.
const THEME_REQUEST_MSG = 'epm-theme-request';
const THEME_UPDATE_MSG = 'epm-theme-update';

/**
 * Syncs this app's theme with the main shell when embedded as an iframe.
 *
 * This app no longer has its own visible theme toggle — the main shell is
 * the single source of truth for theme. This component:
 *   1. On mount, asks the parent shell "what's the current theme?" so this
 *      app matches immediately instead of waiting for the next toggle.
 *   2. Listens forever after for theme-change broadcasts from the shell and
 *      applies them via next-themes' setTheme().
 *
 * Renders nothing. Mount it once, inside <ThemeProvider>, near the root.
 */
export function ThemeBridge() {
  const { setTheme } = useTheme();

  useEffect(() => {
    // Only relevant when actually embedded in an iframe. If this app is ever
    // opened standalone (not inside the main shell), window.parent === window
    // and there is nothing to sync with — leave the local theme as-is.
    if (typeof window === 'undefined' || window.parent === window) return;

    function handleMessage(event: MessageEvent) {
      // Only accept theme updates that came from our embedding parent frame.
      if (event.source !== window.parent) return;
      if (event.data?.type !== THEME_UPDATE_MSG) return;
      const theme = event.data.theme === 'dark' ? 'dark' : 'light';
      setTheme(theme);
    }

    window.addEventListener('message', handleMessage);

    // Ask the parent shell for the current theme right away.
    window.parent.postMessage({ type: THEME_REQUEST_MSG }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, [setTheme]);

  return null;
}
