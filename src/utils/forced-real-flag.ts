import { useSyncExternalStore } from 'react';

// The admin page has an On/Off switch for showing the account DOT94283012 as "Real account".
// ON is today's behaviour, so until the answer arrives (or if it cannot be reached) it stays ON.
let on = true;
let started = false;
const listeners = new Set<() => void>();

const load = () => {
    fetch('/api/site-settings?flag=forced_real', { credentials: 'same-origin', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
            if (j && typeof j.on === 'boolean' && j.on !== on) {
                on = j.on;
                listeners.forEach(l => l());
            }
        })
        .catch(() => {});
};

const subscribe = (listener: () => void) => {
    if (!started) {
        started = true;
        load();
        // pick up a change made in the admin page without a page reload: check every 3 seconds, and at once when the tab is shown again
        if (typeof window !== 'undefined') {
            window.setInterval(() => {
                if (document.visibilityState === 'visible') load();
            }, 3000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') load();
            });
            window.addEventListener('focus', load);
        }
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** true = the forced "Real account" label is switched on (the default). */
export const useForcedRealEnabled = (): boolean => useSyncExternalStore(subscribe, () => on, () => true);
