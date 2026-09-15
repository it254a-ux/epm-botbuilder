import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTheme } from 'next-themes';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';

/**
 * Syncs this app's theme with bot-builder's own theme toggle.
 *
 * This used to run inside a separate parent shell (executive-prime-market-app)
 * via postMessage, back when dtrader was embedded as an iframe. Since then,
 * dtrader was merged directly into bot-builder as a regular page — there is
 * no parent frame anymore, so window.parent === window and the old
 * postMessage listener never fired, silently leaving this app stuck on
 * next-themes' defaultTheme ('light') regardless of what the user actually
 * picked in the header's theme toggle.
 *
 * Now that this app lives in the same React tree as bot-builder, it reads
 * bot-builder's own theme store directly (the same one ChangeTheme.tsx /
 * the header toggle already write to) instead of listening for a message
 * that will never arrive.
 *
 * Renders nothing. Mount it once, inside <ThemeProvider>, near the root.
 */
export const ThemeBridge = observer(() => {
    const { setTheme } = useTheme();
    const { is_dark_mode_on } = useThemeSwitcher();

    useEffect(() => {
        setTheme(is_dark_mode_on ? 'dark' : 'light');
    }, [is_dark_mode_on, setTheme]);

    return null;
});
