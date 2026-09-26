// Same idea as prefetch-tabs.ts, for the standalone info/legal pages
// (src/pages/info/) instead of DBOT_TABS tabs -- these aren't tabs, so they
// don't fit that file's tab-index-keyed shape, but the goal is identical:
// warm each page's own JS chunk on idle time so the first visit is as
// instant as a repeat one, instead of paying a click-to-visible chunk-load
// gap the first time someone opens, say, /legal/privacy-policy.
const PREFETCHABLE_INFO_PAGES = [
    () => import('@/pages/info/about'),
    () => import('@/pages/info/contact'),
    () => import('@/pages/info/risk-disclosure'),
    () => import('@/pages/info/terms'),
    () => import('@/pages/info/privacy-policy'),
] as const;

let already_scheduled = false;

// Warms all five, spread out slightly and only once the browser is idle, so
// this never competes with the initial page load (or the tab-prefetch pass
// in prefetch-tabs.ts) for bandwidth.
export const prefetchInfoPagesWhenIdle = () => {
    if (already_scheduled) return;
    already_scheduled = true;

    const schedule = (fn: () => void) =>
        'requestIdleCallback' in window ? window.requestIdleCallback(fn) : setTimeout(fn, 1);

    PREFETCHABLE_INFO_PAGES.forEach((load, index) => {
        schedule(() =>
            setTimeout(() => {
                // Swallow errors — a failed prefetch shouldn't surface
                // anywhere; the normal React.lazy Suspense load on actual
                // navigation will just retry.
                load().catch(() => undefined);
            }, index * 300)
        );
    });
};
