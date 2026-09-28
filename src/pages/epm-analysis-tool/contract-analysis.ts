import type { EpmTick } from './use-epm-tick-stats';

export type ContractType = 'over_under' | 'odd_even' | 'rise_fall' | 'accumulator' | 'multiplier';

export interface ContractResultRow {
    label: string;
    qualifyingLabel: string;
    observedPct: number;
    theoreticalPct: number;
    currentStreak: number;
    /** How many of the last `windowN` ticks qualified for this side -- used by the user's own rule. */
    recentCount: number;
}

const digitRow = (
    ticks: EpmTick[],
    windowN: number,
    label: string,
    qualifyingLabel: string,
    theoreticalPct: number,
    qualifies: (digit: number) => boolean
): ContractResultRow => {
    const total = ticks.length || 1;
    const hits = ticks.reduce((acc, t) => acc + (qualifies(t.digit) ? 1 : 0), 0);
    let streak = 0;
    for (let i = ticks.length - 1; i >= 0; i--) {
        if (qualifies(ticks[i].digit)) break;
        streak++;
    }
    const recentCount = ticks.slice(-windowN).reduce((acc, t) => acc + (qualifies(t.digit) ? 1 : 0), 0);
    return { label, qualifyingLabel, observedPct: (hits / total) * 100, theoreticalPct, currentStreak: streak, recentCount };
};

/** Over/Under: Under 2 (digits 0-1) vs Over 8 (digit 9). */
export function buildOverUnderRows(ticks: EpmTick[], windowN: number): ContractResultRow[] {
    return [
        digitRow(ticks, windowN, 'Under 2', '0–1', 20, d => d < 2),
        digitRow(ticks, windowN, 'Over 8', '9', 10, d => d > 8),
    ];
}

export function buildOddEvenRows(ticks: EpmTick[], windowN: number): ContractResultRow[] {
    return [
        digitRow(ticks, windowN, 'Even', '0,2,4,6,8', 50, d => d % 2 === 0),
        digitRow(ticks, windowN, 'Odd', '1,3,5,7,9', 50, d => d % 2 !== 0),
    ];
}

/** Rise/Fall -- each tick's quote vs the previous one. Unchanged ticks count for neither side. */
export function buildRiseFallRows(ticks: EpmTick[], windowN: number): ContractResultRow[] {
    let rises = 0;
    let falls = 0;
    for (let i = 1; i < ticks.length; i++) {
        const diff = ticks[i].quote - ticks[i - 1].quote;
        if (diff > 0) rises++;
        else if (diff < 0) falls++;
    }
    const decided = rises + falls || 1;

    let riseStreak = 0;
    for (let i = ticks.length - 1; i > 0; i--) {
        if (ticks[i].quote - ticks[i - 1].quote > 0) break;
        riseStreak++;
    }
    let fallStreak = 0;
    for (let i = ticks.length - 1; i > 0; i--) {
        if (ticks[i].quote - ticks[i - 1].quote < 0) break;
        fallStreak++;
    }

    let recentRises = 0;
    let recentFalls = 0;
    for (let i = Math.max(1, ticks.length - windowN); i < ticks.length; i++) {
        const diff = ticks[i].quote - ticks[i - 1].quote;
        if (diff > 0) recentRises++;
        else if (diff < 0) recentFalls++;
    }

    return [
        { label: 'Rise', qualifyingLabel: 'quote > prev', observedPct: (rises / decided) * 100, theoreticalPct: 50, currentStreak: riseStreak, recentCount: recentRises },
        { label: 'Fall', qualifyingLabel: 'quote < prev', observedPct: (falls / decided) * 100, theoreticalPct: 50, currentStreak: fallStreak, recentCount: recentFalls },
    ];
}

export interface AccumulatorReading {
    recentVolatilityPct: number;
    sessionVolatilityPct: number;
    sampleSize: number;
}

/** Accumulator has no digit/direction split to show as a percentage pair --
 *  it pays out based on the price staying within a range, so the only
 *  honestly relevant read is current vs session-average volatility. No
 *  Low/Medium/High label: that would imply a threshold this tool doesn't
 *  actually know is meaningful for the chosen index. */
export function computeAccumulatorReading(ticks: EpmTick[], recentWindow = 100): AccumulatorReading | null {
    if (ticks.length < 10) return null;

    const pctChanges: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
        const prev = ticks[i - 1].quote;
        if (prev === 0) continue;
        pctChanges.push(Math.abs((ticks[i].quote - prev) / prev) * 100);
    }
    if (!pctChanges.length) return null;

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const recentSlice = pctChanges.slice(-recentWindow);

    return {
        recentVolatilityPct: avg(recentSlice),
        sessionVolatilityPct: avg(pctChanges),
        sampleSize: pctChanges.length,
    };
}
