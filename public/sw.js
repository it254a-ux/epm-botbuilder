// Minimal service worker: it makes the site installable as an app, and nothing more.
// It caches NOTHING (so the site is always the newest version, never a stale copy); it only shows a small
// "you are offline" page when the phone or laptop has no internet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
    if (e.request.mode !== 'navigate') return; // everything else goes straight to the network
    e.respondWith(
        fetch(e.request).catch(
            () =>
                new Response(
                    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
                        '<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0e1621;color:#e8edf5;font-family:system-ui,sans-serif;text-align:center">' +
                        '<div><h2>You are offline</h2><p>Check your internet connection, then reopen Executive Prime Markets.</p></div>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
        )
    );
});
