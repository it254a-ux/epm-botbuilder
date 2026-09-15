/**
 * Unregisters every service worker left behind by an earlier deployment.
 *
 * This app doesn't register a service worker of its own today, but at least
 * one earlier deployment did (see smart-chart.tsx's own narrower cleanup,
 * scoped only to a Flutter-specific one it knew about). A service worker
 * persists in the browser across deployments until something explicitly
 * unregisters it — so anyone who visited before is still silently running
 * whatever caching logic that old worker had, potentially serving stale
 * cached responses for any request (API calls included) without those
 * requests ever reaching the real network. That's indistinguishable from a
 * real bug from the user's side: the page looks broken, and nothing shows
 * up in server-side logs, because the request never left the browser.
 *
 * Run once, globally, on every app load — not scoped to any single page or
 * component, so it clears things before the user can hit a page relying on
 * a request an old worker might intercept.
 */
export function clearStaleServiceWorkers(): void {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
        .getRegistrations()
        .then(registrations => {
            registrations.forEach(registration => {
                registration.unregister().catch(() => {});
            });
        })
        .catch(() => {});

    // Service workers can keep their own Cache Storage entries around even
    // after being unregistered — clear those too, so nothing they cached
    // can still be read by a future fetch that happens to match a stale key.
    if ('caches' in window) {
        caches
            .keys()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .catch(() => {});
    }
}
