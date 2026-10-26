// Desktop header navigation — merges the app's tab bar (previously its own row
// below the header) into this reserved slot next to the logo, so there's a
// single combined header instead of two stacked bars. The tab list still
// renders as its own row on mobile (see main.tsx's `hide_list` prop, which is
// only passed on desktop), since there's no header space for it there.
//
// Every app (PRIMARY_NAV_ITEMS + EXTRA_NAV_ITEMS) sits in one row that scrolls
// sideways. The "More" dropdown keeps only Get Help, Company and Legal.
import { useEffect, useRef, useState, type WheelEvent } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { prefetchTab } from '@/utils/prefetch-tabs';
import { getHelpOptions } from '@/components/get-help';
import ChangeTheme from '@/components/layout/footer/ChangeTheme';
import FullScreen from '@/components/layout/footer/FullScreen';
import LogoutFooter from '@/components/layout/footer/LogoutFooter';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedChevronDownLgRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyCheck1pxIcon, LegacyEmailIcon, LegacyGuide1pxIcon, LegacyInfo1pxIcon, LegacyLock1pxIcon, LegacyWarningIcon } from '@deriv/quill-icons/Legacy';
import { Localize } from '@deriv-com/translations';
import './menu-items.scss';

const PRIMARY_NAV_ITEMS = [
    {
        tab: DBOT_TABS.DASHBOARD,
        icon: <LabelPairedObjectsColumnCaptionRegularIcon height='16px' width='16px' fill='currentColor' />,
        label: <Localize i18n_default_text='Dashboard' />,
    },
    {
        tab: DBOT_TABS.BOT_BUILDER,
        icon: <LabelPairedPuzzlePieceTwoCaptionBoldIcon height='16px' width='16px' fill='currentColor' />,
        label: <Localize i18n_default_text='Bot Builder' />,
    },
    {
        tab: DBOT_TABS.EPM_TRADING_BOTS,
        icon: <span className='app-header__menu-item-emoji'>🤖</span>,
        label: <Localize i18n_default_text='Trading Bots' />,
    },
    {
        tab: DBOT_TABS.EPM_ANALYSIS_TOOL,
        icon: <span className='app-header__menu-item-emoji'>📊</span>,
        label: <Localize i18n_default_text='Analysis Tool' />,
    },
    {
        tab: DBOT_TABS.CHART,
        icon: <LabelPairedChartLineCaptionRegularIcon height='16px' width='16px' fill='currentColor' />,
        label: <Localize i18n_default_text='Charts' />,
    },
];

// These used to live in the "More" dropdown. They now sit in the header row
// after the items above: the row scrolls sideways (swipe / drag / wheel), so
// nothing is hidden and "More" keeps only Get Help, Company and Legal.
const EXTRA_NAV_ITEMS = [
    {
        tab: DBOT_TABS.DTRADER,
        icon: <span className='app-header__menu-item-emoji'>📈</span>,
        label: <Localize i18n_default_text='Dtrader' />,
    },
    {
        tab: DBOT_TABS.TRADING_VIEW,
        icon: <span className='app-header__menu-item-emoji'>📉</span>,
        label: <Localize i18n_default_text='TradingView' />,
    },
    {
        tab: DBOT_TABS.FOREX_LIVE,
        icon: <span className='app-header__menu-item-emoji'>🔴</span>,
        label: <Localize i18n_default_text='Forex Live' />,
    },
    {
        tab: DBOT_TABS.TUTORIAL,
        icon: <LegacyGuide1pxIcon height='12px' width='12px' fill='currentColor' />,
        label: <Localize i18n_default_text='Tutorials' />,
    },
];

// Standalone pages (src/pages/info/) — plain routes, not DBOT_TABS tabs, so
// these render as real links in the "More" dropdown, same as the Get Help
// section below them.
const COMPANY_LINKS = [
    { key: 'about', href: '/about', icon: <LegacyInfo1pxIcon height='12px' width='12px' fill='currentColor' />, label: <Localize i18n_default_text='About us' /> },
    { key: 'contact', href: '/contact', icon: <LegacyEmailIcon height='12px' width='12px' fill='currentColor' />, label: <Localize i18n_default_text='Contact us' /> },
];

const LEGAL_LINKS = [
    { key: 'risk-disclosure', href: '/legal/risk-disclosure', icon: <LegacyWarningIcon height='12px' width='12px' fill='currentColor' />, label: <Localize i18n_default_text='Risk disclosure' /> },
    { key: 'terms', href: '/legal/terms', icon: <LegacyCheck1pxIcon height='12px' width='12px' fill='currentColor' />, label: <Localize i18n_default_text='Terms & conditions' /> },
    { key: 'privacy', href: '/legal/privacy-policy', icon: <LegacyLock1pxIcon height='12px' width='12px' fill='currentColor' />, label: <Localize i18n_default_text='Privacy policy' /> },
];

const NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...EXTRA_NAV_ITEMS];

export const MenuItems = observer(() => {
    const { dashboard } = useStore() ?? {};
    const { isAuthorized } = useApiBase();
    const [is_more_open, setIsMoreOpen] = useState(false);
    const more_wrapper_ref = useRef<HTMLDivElement | null>(null);

    const scroll_ref = useRef<HTMLDivElement | null>(null);
    const current_tab = dashboard?.active_tab;

    // Keep the selected item in view when the row is scrolled sideways.
    useEffect(() => {
        const row = scroll_ref.current;
        const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
        if (!row || !active) return;
        const left = active.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft || left + active.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
        }
    }, [current_tab]);

    // Mouse wheel scrolls the row sideways (phones and trackpads already swipe).
    const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.currentTarget.scrollLeft += event.deltaY;
        }
    };

    // Close the "More" dropdown on outside click or Escape — same pattern
    // used by the account switcher elsewhere in this header.
    useEffect(() => {
        if (!is_more_open) return undefined;

        const handlePointerDown = (event: MouseEvent) => {
            if (more_wrapper_ref.current && !more_wrapper_ref.current.contains(event.target as Node)) {
                setIsMoreOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMoreOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [is_more_open]);

    const navigate = useNavigate();
    const { pathname } = useLocation();

    // No dashboard store yet (very first render tick) — render nothing rather
    // than a nav that can't actually switch tabs.
    if (!dashboard) return null;

    const { active_tab, setActiveTab } = dashboard;

    // Tabs (Dashboard, Bot Builder, Charts, ...) only exist inside AppRoot,
    // mounted on '/' and '/preview' -- setActiveTab alone is a MobX store
    // write with nothing wrong with it, but on any other route (dtrader,
    // about, contact, legal/*) nothing reads it, since AppRoot isn't even
    // mounted there. The tab looked selected (nav highlighting reads
    // active_tab directly) while the actual page never changed, until
    // navigating back to '/' by some other means (the logo) finally mounted
    // AppRoot, which then just showed whatever tab had already been set.
    const goToTab = (tab: number) => {
        if (pathname !== '/' && pathname !== '/preview') navigate('/');
        setActiveTab(tab);
    };

    const handleSelect = (tab: number) => {
        goToTab(tab);
        setIsMoreOpen(false);
    };

    return (
        <nav className='app-header__menu-items' aria-label='Primary'>
            {/* One row with every app. It scrolls sideways (swipe, drag or
                wheel), so more apps can be added without anything being
                hidden behind "More". */}
            <div className='app-header__menu-scroll' ref={scroll_ref} onWheel={handleWheel}>
                {NAV_ITEMS.map(item => (
                    <button
                        key={item.tab}
                        type='button'
                        className={clsx('app-header__menu-item', {
                            'app-header__menu-item--active': active_tab === item.tab,
                        })}
                        onClick={() => goToTab(item.tab)}
                        onMouseEnter={() => prefetchTab(item.tab)}
                        onFocus={() => prefetchTab(item.tab)}
                        aria-current={active_tab === item.tab ? 'page' : undefined}
                    >
                        <span className='app-header__menu-item-icon'>{item.icon}</span>
                        <span className='app-header__menu-item-label'>{item.label}</span>
                    </button>
                ))}
            </div>

            {/* More: Get Help, Company and Legal only. */}
            <div className='app-header__menu-more' ref={more_wrapper_ref}>
                <button
                    type='button'
                    className={clsx('app-header__menu-item', 'app-header__menu-more-toggle')}
                    onClick={() => setIsMoreOpen(open => !open)}
                    aria-haspopup='true'
                    aria-expanded={is_more_open}
                >
                    <span className='app-header__menu-item-label'>
                        <Localize i18n_default_text='More' />
                    </span>
                    <LabelPairedChevronDownLgRegularIcon height='14px' width='14px' fill='currentColor' />
                </button>
                {is_more_open && (
                    <div className='app-header__menu-more-dropdown' role='menu'>
                        {getHelpOptions().length > 0 && (
                            <>
                                <div className='app-header__menu-more-heading'>
                                    <Localize i18n_default_text='Get Help' />
                                </div>
                            </>
                        )}
                        {getHelpOptions().map(option => (
                            <a
                                key={option.key}
                                role='menuitem'
                                className='app-header__menu-more-item'
                                href={option.href}
                                target={option.external ? '_blank' : undefined}
                                rel={option.external ? 'noopener noreferrer' : undefined}
                                onClick={() => setIsMoreOpen(false)}
                            >
                                <span className='app-header__menu-item-icon'>{option.icon}</span>
                                <span className='app-header__menu-item-label'>{option.label}</span>
                            </a>
                        ))}
                        <div className='app-header__menu-more-divider' role='separator' />
                        <div className='app-header__menu-more-heading'>
                            <Localize i18n_default_text='Company' />
                        </div>
                        {COMPANY_LINKS.map(link => (
                            // Link (not a plain <a href>): opens the page inside the app without
                            // reloading the whole site, so the pages already running stay alive.
                            <Link
                                key={link.key}
                                role='menuitem'
                                className='app-header__menu-more-item'
                                to={link.href}
                                onClick={() => setIsMoreOpen(false)}
                            >
                                <span className='app-header__menu-item-icon'>{link.icon}</span>
                                <span className='app-header__menu-item-label'>{link.label}</span>
                            </Link>
                        ))}
                        <div className='app-header__menu-more-divider' role='separator' />
                        <div className='app-header__menu-more-heading'>
                            <Localize i18n_default_text='Legal' />
                        </div>
                        {LEGAL_LINKS.map(link => (
                            // Link (not a plain <a href>): opens the page inside the app without
                            // reloading the whole site, so the pages already running stay alive.
                            <Link
                                key={link.key}
                                role='menuitem'
                                className='app-header__menu-more-item'
                                to={link.href}
                                onClick={() => setIsMoreOpen(false)}
                            >
                                <span className='app-header__menu-item-icon'>{link.icon}</span>
                                <span className='app-header__menu-item-label'>{link.label}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className='app-header__menu-utility-icons'>
                <FullScreen />
                {isAuthorized && <LogoutFooter />}
                <ChangeTheme />
            </div>
        </nav>
    );
});

export const TradershubLink = observer(() => {
    // No default Traders Hub link - add your custom navigation here if needed
    return null;
});

// Create a namespace for MenuItems to include TradershubLink
type MenuItemsType = typeof MenuItems & {
    TradershubLink: typeof TradershubLink;
};

(MenuItems as MenuItemsType).TradershubLink = TradershubLink;

export default MenuItems as MenuItemsType;
