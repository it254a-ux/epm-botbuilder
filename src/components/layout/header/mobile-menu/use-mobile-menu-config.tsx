import { ComponentProps, ReactNode, useMemo } from 'react';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import RootStore from '@/stores/root-store';
import { LegacyGuide1pxIcon, LegacyLogout1pxIcon, LegacyTheme1pxIcon } from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { ToggleSwitch } from '@deriv-com/ui';
import { HELP_OPTIONS } from '@/components/get-help';

export type TSubmenuSection = 'accountSettings' | 'cashier' | 'reports';

//IconTypes
type TMenuConfigItem = {
    LeftComponent: React.ElementType;
    RightComponent?: ReactNode;
    as: 'a' | 'button';
    href?: string;
    label: ReactNode;
    onClick?: () => void;
    removeBorderBottom?: boolean;
    submenu?: TSubmenuSection;
    target?: ComponentProps<'a'>['target'];
    isActive?: boolean;
};

export type TMenuConfig = TMenuConfigItem[];

// A section can carry an optional title, rendered above its items (e.g.
// "Customer support" grouping WhatsApp/Message/Call) — most sections have
// none and just render as a plain bordered block, same as before.
export type TMenuSection = {
    title?: string;
    items: TMenuConfig;
};

const useMobileMenuConfig = (
    client?: RootStore['client'],
    onLogout?: () => void,
    enableThemeToggle: boolean = true,
    onNavigateToTutorials?: () => void
) => {
    const { localize } = useTranslations();
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();

    const menuConfig = useMemo((): TMenuSection[] => {

        return [
            {
                items: [
                    // ========================================
                    // CUSTOM MENU ITEMS PLACEHOLDER
                    // ========================================
                    //
                    // Add your custom menu items here.
                    //
                    // EXAMPLE:
                    // {
                    //     as: 'a',
                    //     label: localize('Your Page'),
                    //     LeftComponent: YourIcon,
                    //     href: '/your-page',
                    // },
                    //
                    // For desktop menu items, see:
                    // src/components/layout/header/header-config.tsx

                    // Conditionally include theme toggle based on brand config
                    enableThemeToggle && {
                        as: 'button',
                        label: localize('Dark theme'),
                        LeftComponent: LegacyTheme1pxIcon,
                        RightComponent: <ToggleSwitch value={is_dark_mode_on} onChange={toggleTheme} />,
                    },
                    // Same tab the desktop nav's "More" dropdown links to
                    // (see menu-items.tsx's PINNED_OVERFLOW_ITEMS) — mobile
                    // had no equivalent entry point to it at all.
                    onNavigateToTutorials && {
                        as: 'button',
                        label: localize('Tutorials'),
                        LeftComponent: LegacyGuide1pxIcon,
                        onClick: onNavigateToTutorials,
                    },
                ].filter(Boolean) as TMenuConfig,
            },
            // WhatsApp / Message / Call are the same links the old floating
            // "get help" button showed (see components/get-help), grouped
            // here under one heading instead of appearing as unlabelled,
            // unrelated-looking rows.
            {
                title: localize('Customer support'),
                items: HELP_OPTIONS.map(option => ({
                    as: 'a',
                    label: option.label,
                    LeftComponent: () => option.icon,
                    href: option.href,
                    target: option.external ? '_blank' : undefined,
                })) as TMenuConfig,
            },
            {
                items: [
                    client?.is_logged_in &&
                        onLogout && {
                            as: 'button',
                            label: localize('Log out'),
                            LeftComponent: LegacyLogout1pxIcon,
                            onClick: onLogout,
                            removeBorderBottom: true,
                        },
                ].filter(Boolean) as TMenuConfig,
            },
        ].filter(section => section.items.length > 0);
    }, [
        client,
        onLogout,
        is_dark_mode_on,
        toggleTheme,
        localize,
        enableThemeToggle, // [AI] Added to recalculate menu when theme toggle config changes
        onNavigateToTutorials,
    ]);

    // [AI] Check if menu has any items to determine if mobile menu should be shown
    const hasMenuItems = menuConfig.some(section => section.items.length > 0);
    // [/AI]

    return {
        config: menuConfig,
        // [AI] Return flag indicating if menu has any items
        hasMenuItems,
        // [/AI]
    };
};

export default useMobileMenuConfig;
