import { useSyncExternalStore } from 'react';

// The admin page has an On/Off switch for showing the account DOT94283012 as "Real account".
// ON is today's behaviour, so until the answer arrives (or if it cannot be reached) it stays ON.
let on = true;
// the accounts shown as "Real Account" (the admin can change this list; until it answers, the first one stays)
let accounts: string[] = ['DOT94283012'];
let started = false;
const listeners = new Set<() => void>();

const apply = (next: unknown, nextAccounts?: unknown) => {
    let changed = false;
    if (typeof next === 'boolean' && next !== on) {
        on = next;
        changed = true;
    }
    if (Array.isArray(nextAccounts)) {
        const list = nextAccounts.filter((x): x is string => typeof x === 'string');
        if (list.join(',') !== accounts.join(',')) {
            accounts = list;
            changed = true;
        }
    }
    if (changed) listeners.forEach(l => l());
};

const load = () => {
    fetch('/api/site-settings?flag=forced_real', { credentials: 'same-origin', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => apply(j && j.on, j && j.accounts))
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
                    const d = JSON.parse(e.data);
                    apply(d.on, d.accounts);
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

/** the account IDs that are shown as "Real Account" while the switch is on (changed from the Admin page). */
export const useForcedRealAccounts = (): string[] =>
    useSyncExternalStore(subscribe, () => accounts, () => accounts);
