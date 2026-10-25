import { useSyncExternalStore } from 'react';

// The admin page has an On/Off switch for showing the account DOT94283012 as "Real account".
// ON is today's behaviour, so until the answer arrives (or if it cannot be reached) it stays ON.
let on = true;
let started = false;
const listeners = new Set<() => void>();

const apply = (next: unknown) => {
    if (typeof next === 'boolean' && next !== on) {
        on = next;
        listeners.forEach(l => l());
    }
};

const load = () => {
    fetch('/api/site-settings?flag=forced_real', { credentials: 'same-origin', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => apply(j && j.on))
        .catch(() => {});
};

const subscribe = (listener: () => void) => {
    if (!started) {
        started = true;
        load();
        // LIVE: the server tells every open page the moment the admin flips the switch (the browser reconnects by itself
        // when the stream ends). A slow check stays as a safety net in case the stream is blocked.
        if (typeof EventSource !== 'undefined') {
            const es = new EventSource('/api/site-settings?flag=forced_real&stream=1');
            es.onmessage = e => {
                try {
                    apply(JSON.parse(e.data).on);
                } catch {
                    /* ignore a broken message */
                }
            };
        }
        if (typeof window !== 'undefined') {
            window.setInterval(() => {
                if (document.visibilityState === 'visible') load();
            }, 10000);
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
