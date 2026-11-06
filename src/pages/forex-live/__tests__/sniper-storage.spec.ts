import { loadGroups, loadSniper, RESUME_WINDOW_MS, saveGroups, saveSniper, shouldResume } from '../sniper-storage';

const memory = () => {
    const m: Record<string, string> = {};
    return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => void (m[k] = v) };
};

describe('Sweep Sniper memory', () => {
    it('remembers the settings and whether it was armed', () => {
        const st = memory();
        saveSniper({ symbol: 'frxXAUUSD', count: 6, stake: '20', tp: '20', sl: '', on: true, mode: 'breakout', fired: ['SELL'], savedAt: 1000 }, st);
        expect(loadSniper(st)).toEqual({ symbol: 'frxXAUUSD', count: 6, stake: '20', tp: '20', sl: '', on: true, mode: 'breakout', fired: ['SELL'], savedAt: 1000 });
    });

    it('survives broken or missing saved data', () => {
        expect(loadSniper(memory())).toBeNull();
        expect(loadSniper({ getItem: () => '{not json' })).toBeNull();
        expect(loadSniper({ getItem: () => JSON.stringify({ symbol: 'x', count: -3, fired: ['HOLD', 'BUY'] }) })).toMatchObject({ count: 1, fired: ['BUY'], on: false });
    });

    it('comes back armed only on the same market and within a day', () => {
        const saved = { symbol: 'frxXAUUSD', count: 1, stake: '', tp: '', sl: '', on: true, mode: 'reverse' as const, fired: [], savedAt: 1_000_000 };
        expect(shouldResume(saved, 'frxXAUUSD', 1_000_000 + 60_000)).toBe(true);
        expect(shouldResume(saved, 'frxEURUSD', 1_000_000 + 60_000)).toBe(false);
        expect(shouldResume(saved, 'frxXAUUSD', 1_000_000 + RESUME_WINDOW_MS + 1)).toBe(false);
        expect(shouldResume({ ...saved, on: false }, 'frxXAUUSD', 1_000_000 + 60_000)).toBe(false);
        expect(shouldResume(null, 'frxXAUUSD')).toBe(false);
    });

    it('remembers the groups of trades that are still being watched, and forgets finished or old ones', () => {
        const st = memory();
        const now = 5_000_000_000;
        saveGroups(
            [
                { uid: 1, at: now - 1000, active: true, side: 'SELL', ids: [11, 12], takeProfit: 20, stopLoss: null, done: false },
                { uid: 2, at: now - 1000, active: true, side: 'BUY', ids: [13], takeProfit: 5, stopLoss: null, done: true },
                { uid: 3, at: now - 10 * 24 * 3600 * 1000, active: true, side: 'BUY', ids: [14], takeProfit: 5, stopLoss: null, done: false },
            ],
            now,
            st
        );
        const back = loadGroups(now, st);
        expect(back).toHaveLength(1);
        expect(back[0]).toMatchObject({ uid: 1, ids: [11, 12], takeProfit: 20 });
    });
});
