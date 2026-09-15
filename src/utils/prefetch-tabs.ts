// Charts, Dtrader, Tutorials, and EPM Trading Bots are all React.lazy'd
// (see main.tsx) so their JS only starts downloading the moment someone
// clicks that tab — that click-to-visible gap is what read as "not
// instant". Calling the same dynamic import() ahead of time (idle, or on
// hover) makes the browser fetch/parse/cache the module early, so by the
// time the tab is actually clicked React.lazy's import() resolves against
// an already-cached module instead of starting a fresh network request.
//
// Note: this only warms the route's own JS chunk. Charts/Dtrader also pull
// in @deriv-com/smartcharts-champion's own chart engine (CanvasKit/WASM,
// ~29MB unpacked) at mount time, which this can't prefetch — that engine is
// fetched by the charting library itself once the chart actually mounts,
// and is the larger, structural part of the wait on a first (uncached)
// visit. Browser caching makes it fast again on repeat visits.
import { DBOT_TABS } from '@/constants/bot-contents';

const PREFETCHABLE_TABS = {
    [DBOT_TABS.CHART]: () => import('@/pages/chart/chart-wrapper'),
    [DBOT_TABS.DTRADER]: () => import('@/pages/dtrader'),
    [DBOT_TABS.TUTORIAL]: () => import('@/pages/tutorials'),
    [DBOT_TABS.EPM_TRADING_BOTS]: () => import('@/pages/epm-trading-bots'),
} as const;

const already_prefetched = new Set<number>();

export const prefetchTab = (tab: number) => {
    const load = PREFETCHABLE_TABS[tab as keyof typeof PREFETCHABLE_TABS];
    if (!load || already_prefetched.has(tab)) return;
    already_prefetched.add(tab);
    // Swallow errors — a failed prefetch shouldn't surface anywhere; the
    // normal React.lazy Suspense load on actual navigation will just retry.
    load().catch(() => already_prefetched.delete(tab));
};

// Warms all lazy tabs, spread out slightly and only once the browser is
// idle, so this never competes with the initial page load for bandwidth.
export const prefetchAllTabsWhenIdle = () => {
    const tabs = Object.keys(PREFETCHABLE_TABS).map(Number);
    const schedule = (fn: () => void) =>
        'requestIdleCallback' in window ? window.requestIdleCallback(fn) : setTimeout(fn, 1);

    tabs.forEach((tab, index) => {
        schedule(() => setTimeout(() => prefetchTab(tab), index * 300));
    });
};
