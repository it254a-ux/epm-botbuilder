// Desktop header navigation — merges the app's tab bar (previously its own row
// below the header) into this reserved slot next to the logo, so there's a
// single combined header instead of two stacked bars. The tab list still
// renders as its own row on mobile (see main.tsx's `hide_list` prop, which is
// only passed on desktop), since there's no header space for it there.
//
// Overflow: this list keeps growing (Dashboard, Bot Builder, Trading Bots,
// Charts, Dtrader, TradingView, Tutorials, and more planned later), so
// rather than a fixed cutoff, the row measures its own available width and
// moves whatever doesn't fit into a "More" dropdown — automatically, so
// adding another item to NAV_ITEMS later doesn't require touching this
// overflow logic again.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { prefetchTab } from '@/utils/prefetch-tabs';
import ChangeTheme from '@/components/layout/footer/ChangeTheme';
import FullScreen from '@/components/layout/footer/FullScreen';
import LogoutFooter from '@/components/layout/footer/LogoutFooter';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedChevronDownLgRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyGuide1pxIcon } from '@deriv/quill-icons/Legacy';
import { Localize } from '@deriv-com/translations';
import './menu-items.scss';

const NAV_ITEMS = [
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
        tab: DBOT_TABS.CHART,
        icon: <LabelPairedChartLineCaptionRegularIcon height='16px' width='16px' fill='currentColor' />,
        label: <Localize i18n_default_text='Charts' />,
    },
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
        tab: DBOT_TABS.TUTORIAL,
        icon: <LegacyGuide1pxIcon height='12px' width='12px' fill='currentColor' />,
        label: <Localize i18n_default_text='Tutorials' />,
    },
];

// How many items fit before we need the "More" button, given the row's
// current width. Re-measured whenever the row resizes (window resize,
// sidebar toggling, zoom level, etc.) or NAV_ITEMS' length changes.
const useVisibleItemCount = (itemCount: number) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const moreButtonRef = useRef<HTMLButtonElement | null>(null);
    // Start optimistic (everything visible, no "More" button) so there's
    // nothing to measure against on a first paint before refs exist —
    // avoids a flash of an empty/near-empty nav before the real measurement
    // runs a moment later.
    const [visible_count, setVisibleCount] = useState(itemCount);

    const measure = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const available_width = container.clientWidth;
        const more_button_width = moreButtonRef.current?.offsetWidth ?? 40;

        let used_width = 0;
        let fit_count = 0;

        for (let i = 0; i < itemCount; i += 1) {
            const item_width = itemRefs.current[i]?.offsetWidth ?? 0;
            // Reserve room for the More button unless this is the very last
            // item (in which case nothing would be left over to put in it).
            const needs_more_button_room = i < itemCount - 1;
            const budget = needs_more_button_room ? available_width - more_button_width : available_width;

            if (used_width + item_width > budget) break;
            used_width += item_width;
            fit_count += 1;
        }

        // Always show at least one item, even if the row is extremely
        // narrow — an empty nav is worse than one slightly-clipped item.
        setVisibleCount(Math.max(1, fit_count));
    }, [itemCount]);

    useLayoutEffect(() => {
        measure();
    }, [measure]);

    // Re-measure once web fonts finish loading. The icon fonts and any
    // custom label typefaces can render narrower with a fallback font
    // before they load, then widen once the real font is ready -- if that
    // happens after the layout-effect measurement above, an item can be
    // undercounted as fitting when it doesn't, and instead of falling back
    // to the "More" dropdown it just visually clips against this row's own
    // overflow:hidden with no button to reach it.
    useEffect(() => {
        if (typeof document === 'undefined' || !('fonts' in document)) return undefined;
        let cancelled = false;
        document.fonts.ready.then(() => {
            if (!cancelled) measure();
        });
        return () => {
            cancelled = true;
        };
    }, [measure]);

    // Belt-and-suspenders: several nav items use emoji icons (Trading Bots,
    // Dtrader, TradingView), and emoji rendering doesn't go through the CSS
    // Font Loading API at all -- document.fonts.ready above wouldn't catch
    // their metrics settling. A single delayed re-measure shortly after
    // mount is a simple, timing-agnostic catch-all for that and anything
    // else that might shift item widths after the first paint.
    useEffect(() => {
        const timer = setTimeout(() => measure(), 300);
        return () => clearTimeout(timer);
    }, [measure]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return undefined;

        const observer_instance = new ResizeObserver(() => measure());
        observer_instance.observe(container);
        return () => observer_instance.disconnect();
    }, [measure]);

    return { containerRef, itemRefs, moreButtonRef, visible_count };
};

export const MenuItems = observer(() => {
    const { dashboard } = useStore() ?? {};
    const { isAuthorized } = useApiBase();
    const [is_more_open, setIsMoreOpen] = useState(false);
    const more_wrapper_ref = useRef<HTMLDivElement | null>(null);

    const { containerRef, itemRefs, moreButtonRef, visible_count } = useVisibleItemCount(NAV_ITEMS.length);

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

    // No dashboard store yet (very first render tick) — render nothing rather
    // than a nav that can't actually switch tabs.
    if (!dashboard) return null;

    const { active_tab, setActiveTab } = dashboard;

    const overflow_items = NAV_ITEMS.slice(visible_count);
    const active_item_is_overflowed = overflow_items.some(item => item.tab === active_tab);

    const handleSelect = (tab: number) => {
        setActiveTab(tab);
        setIsMoreOpen(false);
    };

    return (
        <nav className='app-header__menu-items' aria-label='Primary' ref={containerRef}>
            {/* Every item always renders (off-screen ones are just visually
                hidden, not unmounted) so their real widths stay measurable —
                unmounting them would make it impossible to detect when the
                row has grown back enough room to show them again. */}
            {NAV_ITEMS.map((item, index) => (
                <button
                    key={item.tab}
                    ref={el => {
                        itemRefs.current[index] = el;
                    }}
                    type='button'
                    className={clsx('app-header__menu-item', {
                        'app-header__menu-item--active': active_tab === item.tab,
                    })}
                    style={index >= visible_count ? { position: 'absolute', visibility: 'hidden' } : undefined}
                    aria-hidden={index >= visible_count || undefined}
                    tabIndex={index >= visible_count ? -1 : undefined}
                    onClick={() => setActiveTab(item.tab)}
                    onMouseEnter={() => prefetchTab(item.tab)}
                    onFocus={() => prefetchTab(item.tab)}
                    aria-current={active_tab === item.tab ? 'page' : undefined}
                >
                    <span className='app-header__menu-item-icon'>{item.icon}</span>
                    <span className='app-header__menu-item-label'>{item.label}</span>
                </button>
            ))}

            {overflow_items.length > 0 && (
                <div className='app-header__menu-more' ref={more_wrapper_ref}>
                    <button
                        ref={moreButtonRef}
                        type='button'
                        className={clsx('app-header__menu-item', 'app-header__menu-more-toggle', {
                            'app-header__menu-item--active': active_item_is_overflowed,
                        })}
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
                            {overflow_items.map(item => (
                                <button
                                    key={item.tab}
                                    type='button'
                                    role='menuitem'
                                    className={clsx('app-header__menu-more-item', {
                                        'app-header__menu-more-item--active': active_tab === item.tab,
                                    })}
                                    onClick={() => handleSelect(item.tab)}
                                    onMouseEnter={() => prefetchTab(item.tab)}
                                >
                                    <span className='app-header__menu-item-icon'>{item.icon}</span>
                                    <span className='app-header__menu-item-label'>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
