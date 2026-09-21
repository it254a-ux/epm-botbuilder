type TTabsTitle = {
    [key: string]: string | number;
};
type TDashboardTabIndex = {
    [key: string]: number;
};
export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});
export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    EPM_TRADING_BOTS: 2,
    CHART: 3,
    DTRADER: 4,
    TRADING_VIEW: 5,
    TUTORIAL: 6,
});
export const MAX_STRATEGIES = 10;
export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-epm-trading-bots',
    'id-charts',
    'id-dtrader',
    'id-trading-view',
    'id-tutorials',
];
export const DEBOUNCE_INTERVAL_TIME = 500;
