import type { EpmTick } from './use-epm-tick-stats';

export interface FrequencyRow {
    threshold: number;
    digitsLabel: string;
    observedPct: number;
    theoreticalPct: number;
    currentStreak: number;
}

/** Under-N: digits 0..N-1 qualify. */
export function buildUnderTable(ticks: EpmTick[]): FrequencyRow[] {
    const total = ticks.length || 1;
    const rows: FrequencyRow[] = [];
    for (let n = 2; n <= 7; n++) {
        const hits = ticks.reduce((acc, t) => acc + (t.digit < n ? 1 : 0), 0);
        let streak = 0;
        for (let i = ticks.length - 1; i >= 0; i--) {
            if (ticks[i].digit < n) break;
            streak++;
        }
        rows.push({
            threshold: n,
            digitsLabel: `0–${n - 1}`,
            observedPct: (hits / total) * 100,
            theoreticalPct: n * 10,
            currentStreak: streak,
        });
    }
    return rows;
}

/** Over-N: digits N+1..9 qualify. */
export function buildOverTable(ticks: EpmTick[]): FrequencyRow[] {
    const total = ticks.length || 1;
    const rows: FrequencyRow[] = [];
    for (let n = 2; n <= 7; n++) {
        const hits = ticks.reduce((acc, t) => acc + (t.digit > n ? 1 : 0), 0);
        let streak = 0;
        for (let i = ticks.length - 1; i >= 0; i--) {
            if (ticks[i].digit > n) break;
            streak++;
        }
        rows.push({
            threshold: n,
            digitsLabel: `${n + 1}–9`,
            observedPct: (hits / total) * 100,
            theoreticalPct: (9 - n) * 10,
            currentStreak: streak,
        });
    }
    return rows;
}
