import type { GuardGroup, SniperMode } from './price-guard';
import type { Side } from './trade-engine';

/**
 * What the Sweep Sniper remembers across a page refresh: the settings, and whether it was armed.
 * A sniper that was armed comes back armed (on the same market, within a day), so a refresh does not leave a
 * trade unwatched. The trades it already opened are remembered too, so their total take profit / stop loss keeps working.
 */
export interface SavedSniper {
    symbol: string;
    count: number;
    stake: string;
    tp: string;
    sl: string;
    on: boolean;
    mode: SniperMode;
    fired: Side[];
    savedAt: number;
}

const SNIPER_KEY = 'epm_sweep_sniper_v1';
const GROUPS_KEY = 'epm_sweep_sniper_groups_v1';
/** A sniper left armed longer ago than this is not switched on again by itself. */
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
const GROUP_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export function loadSniper(storage: Pick<Storage, 'getItem'> = localStorage): SavedSniper | null {
    try {
        const raw = storage.getItem(SNIPER_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as Partial<SavedSniper>;
        if (!v || typeof v !== 'object' || typeof v.symbol !== 'string') return null;
        return {
            symbol: v.symbol,
            count: Number.isFinite(v.count) && (v.count as number) >= 1 ? (v.count as number) : 1,
            stake: typeof v.stake === 'string' ? v.stake : '',
            tp: typeof v.tp === 'string' ? v.tp : '',
            sl: typeof v.sl === 'string' ? v.sl : '',
            on: v.on === true,
            mode: v.mode === 'breakout' ? 'breakout' : 'reverse',
            fired: Array.isArray(v.fired) ? v.fired.filter((s): s is Side => s === 'BUY' || s === 'SELL') : [],
            savedAt: Number.isFinite(v.savedAt) ? (v.savedAt as number) : 0,
        };
    } catch {
        return null;
    }
}

export function saveSniper(s: SavedSniper, storage: Pick<Storage, 'setItem'> = localStorage) {
    try {
        storage.setItem(SNIPER_KEY, JSON.stringify(s));
    } catch {
        /* private mode or blocked storage: the sniper simply does not remember */
    }
}

/** Should a saved sniper switch itself on again? Only if it was armed, on this market, and recently. */
export function shouldResume(saved: SavedSniper | null, symbol: string, now = Date.now()): boolean {
    return !!saved && saved.on && saved.symbol === symbol && now - saved.savedAt < RESUME_WINDOW_MS;
}

export function loadGroups(now = Date.now(), storage: Pick<Storage, 'getItem'> = localStorage): GuardGroup[] {
    try {
        const raw = storage.getItem(GROUPS_KEY);
        const list = raw ? (JSON.parse(raw) as GuardGroup[]) : [];
        return (Array.isArray(list) ? list : [])
            .filter(g => g && Array.isArray(g.ids) && !g.done && now - (g.at ?? 0) < GROUP_KEEP_MS)
            .map(g => ({ ...g, ids: g.ids.filter(n => Number.isFinite(n)) }));
    } catch {
        return [];
    }
}

export function saveGroups(groups: GuardGroup[], now = Date.now(), storage: Pick<Storage, 'setItem'> = localStorage) {
    try {
        const keep = groups.filter(g => !g.done && now - (g.at ?? now) < GROUP_KEEP_MS);
        storage.setItem(GROUPS_KEY, JSON.stringify(keep));
    } catch {
        /* not critical */
    }
}
