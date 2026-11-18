import type { GuardGroup, SniperMode } from './price-guard';
import type { Side } from './trade-engine';

/**
 * What the Sniper remembers across a page refresh: its settings only. It never switches itself back on: it stays off
 * until the person presses Arm. The trades it already opened are remembered, so their total take profit / stop loss keeps working.
 */
export interface SavedSniper {
    symbol: string;
    count: number;
    stake: string;
    /** The multiplier chosen in the Sniper ('' = the Trade panel's). */
    mult: string;
    tp: string;
    sl: string;
    on: boolean;
    mode: SniperMode;
    fired: Side[];
    savedAt: number;
}

const SNIPER_KEY = 'epm_sweep_sniper_v1';
const GROUPS_KEY = 'epm_sweep_sniper_groups_v1';
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
            mult: typeof v.mult === 'string' ? v.mult : '',
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

/** One extra Sniper target (a price and the side to trade there). */
export interface SavedTarget {
    id: number;
    text: string;
    side: Side;
}

const TARGETS_KEY = 'epm_sweep_sniper_targets_v1';

/** The extra targets of this market from before a refresh (a price means nothing on another market). The Sniper itself stays off. */
export function loadTargets(symbol: string, storage: Pick<Storage, 'getItem'> = localStorage): SavedTarget[] {
    try {
        const raw = storage.getItem(TARGETS_KEY);
        const v = raw ? (JSON.parse(raw) as { symbol?: string; list?: SavedTarget[] }) : null;
        if (!v || v.symbol !== symbol || !Array.isArray(v.list)) return [];
        return v.list
            .filter(t => t && Number.isFinite(t.id) && typeof t.text === 'string' && (t.side === 'BUY' || t.side === 'SELL'))
            .map(t => ({ id: t.id, text: t.text, side: t.side }));
    } catch {
        return [];
    }
}

export function saveTargets(symbol: string, list: SavedTarget[], storage: Pick<Storage, 'setItem'> = localStorage) {
    try {
        storage.setItem(TARGETS_KEY, JSON.stringify({ symbol, list: list.map(t => ({ id: t.id, text: t.text, side: t.side })) }));
    } catch {
        /* private mode or blocked storage: the targets simply are not remembered */
    }
}
