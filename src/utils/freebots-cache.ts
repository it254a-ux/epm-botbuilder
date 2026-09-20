import { localize } from '@deriv-com/translations';

export type TBotSummary = {
    id: number;
    name: string;
    description: string;
    market: string;
    risk_level: string;
    contract_type: string;
    created_at: string;
};

// Module-level (not component state) so it survives the Freebots component
// being unmounted and remounted every time someone leaves and returns to
// that tab -- Tabs unmounts inactive tabs entirely.
//
// Also mirrored into sessionStorage: an in-memory cache alone only helps
// switching tabs within the same page load -- a full refresh clears it,
// since that's a fresh JS execution. Reading sessionStorage here, at
// module-evaluation time, means a refresh can still show the last known
// list instantly instead of a bare loading state, while a background
// fetch keeps it current.
const SESSION_STORAGE_KEY = 'epm_freebots_cache_v1';

export let bots_cache: TBotSummary[] | null = (() => {
    try {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as TBotSummary[]) : null;
    } catch {
        // Storage unavailable (privacy mode, quota, etc.) or corrupted --
        // fall back to no cache, same as before this existed.
        return null;
    }
})();

export const persistBotsCache = (bots_list: TBotSummary[]) => {
    bots_cache = bots_list;
    try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(bots_list));
    } catch {
        // Ignore -- the in-memory cache above still works for this page load.
    }
};

let in_flight: Promise<TBotSummary[]> | null = null;

// Fetches the bot list and updates the shared cache above. Two callers use
// this: the Freebots component itself (on mount) and the background
// prefetch fired once Charts finishes loading (main.tsx) -- both read/write
// the same cache instead of racing separate copies. De-duplicated so if
// both happen to fire close together, only one network request goes out.
export const fetchAndCacheBots = async (): Promise<TBotSummary[]> => {
    if (in_flight) return in_flight;
    in_flight = (async () => {
        try {
            const res = await fetch(`/api/bots?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || localize('Failed to load bots'));
            const bots_list: TBotSummary[] = data.bots || [];
            persistBotsCache(bots_list);
            return bots_list;
        } finally {
            in_flight = null;
        }
    })();
    return in_flight;
};
