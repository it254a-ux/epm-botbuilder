import { ComponentProps, ReactNode, useMemo } from 'react';
import RootStore from '@/stores/root-store';
import {
    LegacyCheck1pxIcon,
    LegacyEmailIcon,
    LegacyGuide1pxIcon,
    LegacyInfo1pxIcon,
    LegacyLock1pxIcon,
    LegacyLogout1pxIcon,
    LegacyWarningIcon,
} from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
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

                    // Theme toggle used to be a row here (behind enableThemeToggle);
                    // it now lives in the drawer header next to "Settings" instead
                    // (see MenuHeader / mobile-menu.tsx's showThemeToggle prop).

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
            // Standalone pages (src/pages/info/) — plain routes, not
            // DBOT_TABS tabs, so these are real links (full navigation),
            // same pattern as Customer support's WhatsApp/Message/Call above.
            {
                title: localize('Company'),
                items: [
                    {
                        as: 'a',
                        label: localize('About us'),
                        LeftComponent: LegacyInfo1pxIcon,
                        href: '/about',
                    },
                    {
                        as: 'a',
                        label: localize('Contact us'),
                        LeftComponent: LegacyEmailIcon,
                        href: '/contact',
                    },
                ] as TMenuConfig,
            },
            {
                title: localize('Legal'),
                items: [
                    {
                        as: 'a',
                        label: localize('Risk disclosure'),
                        LeftComponent: LegacyWarningIcon,
                        href: '/legal/risk-disclosure',
                    },
                    {
                        as: 'a',
                        label: localize('Terms & conditions'),
                        LeftComponent: LegacyCheck1pxIcon,
                        href: '/legal/terms',
                    },
                    {
                        as: 'a',
                        label: localize('Privacy policy'),
                        LeftComponent: LegacyLock1pxIcon,
                        href: '/legal/privacy-policy',
                    },
                ] as TMenuConfig,
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
    }, [client, onLogout, localize, onNavigateToTutorials]);

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
