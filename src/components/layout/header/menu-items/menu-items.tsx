// Desktop header navigation — merges the app's tab bar (previously its own row
// below the header) into this reserved slot next to the logo, so there's a
// single combined header instead of two stacked bars. The tab list still
// renders as its own row on mobile (see main.tsx's `hide_list` prop, which is
// only passed on desktop), since there's no header space for it there.
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import ChangeTheme from '@/components/layout/footer/ChangeTheme';
import FullScreen from '@/components/layout/footer/FullScreen';
import LogoutFooter from '@/components/layout/footer/LogoutFooter';
import {
    LabelPairedChartLineCaptionRegularIcon,
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
        tab: DBOT_TABS.TUTORIAL,
        icon: <LegacyGuide1pxIcon height='12px' width='12px' fill='currentColor' />,
        label: <Localize i18n_default_text='Tutorials' />,
    },
    {
        tab: DBOT_TABS.EPM_TRADING_BOTS,
        icon: <span className='app-header__menu-item-emoji'>🤖</span>,
        label: <Localize i18n_default_text='Trading Bots' />,
    },
];

export const MenuItems = observer(() => {
    const { dashboard } = useStore() ?? {};
    const { isAuthorized } = useApiBase();

    // No dashboard store yet (very first render tick) — render nothing rather
    // than a nav that can't actually switch tabs.
    if (!dashboard) return null;

    const { active_tab, setActiveTab } = dashboard;

    return (
        <nav className='app-header__menu-items' aria-label='Primary'>
            {NAV_ITEMS.map(item => (
                <button
                    key={item.tab}
                    type='button'
                    className={clsx('app-header__menu-item', {
                        'app-header__menu-item--active': active_tab === item.tab,
                    })}
                    onClick={() => setActiveTab(item.tab)}
                    aria-current={active_tab === item.tab ? 'page' : undefined}
                >
                    <span className='app-header__menu-item-icon'>{item.icon}</span>
                    <span className='app-header__menu-item-label'>{item.label}</span>
                </button>
            ))}
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
