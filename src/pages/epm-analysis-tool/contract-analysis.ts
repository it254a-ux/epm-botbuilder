import type { EpmTick } from './use-epm-tick-stats';

export type ContractType = 'over_under' | 'odd_even' | 'rise_fall' | 'accumulator';

export interface ContractResultRow {
    label: string;
    qualifyingLabel: string;
    observedPct: number;
    theoreticalPct: number;
    currentStreak: number;
}

/** Over/Under, restricted to the 80/20 splits only (no threshold sweep):
 *  Under 2 (0-1, 20%) vs Over 1 (2-9, 80%), and
 *  Over 7 (8-9, 20%) vs Under 8 (0-7, 80%).
 *  Each pair is complementary, so every row is either the 20% or 80% side. */
export function buildOverUnderRows(ticks: EpmTick[]): ContractResultRow[] {
    const total = ticks.length || 1;

    const makeRow = (
        label: string,
        qualifyingLabel: string,
        theoreticalPct: number,
        qualifies: (digit: number) => boolean
    ): ContractResultRow => {
        const hits = ticks.reduce((acc, t) => acc + (qualifies(t.digit) ? 1 : 0), 0);
        let streak = 0;
        for (let i = ticks.length - 1; i >= 0; i--) {
            if (qualifies(ticks[i].digit)) break;
            streak++;
        }
        return { label, qualifyingLabel, observedPct: (hits / total) * 100, theoreticalPct, currentStreak: streak };
    };

    return [
        makeRow('Under 2', '0–1', 20, d => d < 2),
        makeRow('Over 1', '2–9', 80, d => d > 1),
        makeRow('Over 7', '8–9', 20, d => d > 7),
        makeRow('Under 8', '0–7', 80, d => d < 8),
    ];
}

/** Odd/Even -- theoretical baseline is 50/50, not 80/20; shown as-is. */
export function buildOddEvenRows(ticks: EpmTick[]): ContractResultRow[] {
    const total = ticks.length || 1;

    const evenHits = ticks.reduce((acc, t) => acc + (t.digit % 2 === 0 ? 1 : 0), 0);
    let evenStreak = 0;
    for (let i = ticks.length - 1; i >= 0; i--) {
        if (ticks[i].digit % 2 === 0) break;
        evenStreak++;
    }

    const oddHits = total - evenHits;
    let oddStreak = 0;
    for (let i = ticks.length - 1; i >= 0; i--) {
        if (ticks[i].digit % 2 !== 0) break;
        oddStreak++;
    }

    return [
        {
            label: 'Even',
            qualifyingLabel: '0,2,4,6,8',
            observedPct: (evenHits / total) * 100,
            theoreticalPct: 50,
            currentStreak: evenStreak,
        },
        {
            label: 'Odd',
            qualifyingLabel: '1,3,5,7,9',
            observedPct: (oddHits / total) * 100,
            theoreticalPct: 50,
            currentStreak: oddStreak,
        },
    ];
}

/** Rise/Fall -- compares each tick's quote to the previous one.
 *  Theoretical baseline is 50/50, same as Odd/Even. Unchanged ticks
 *  (quote === previous quote) count toward neither side, same as how
 *  Deriv settles a Rise/Fall contract on an unchanged price. */
export function buildRiseFallRows(ticks: EpmTick[]): ContractResultRow[] {
    let rises = 0;
    let falls = 0;
    let decided = 0;
    let riseStreak = 0;
    let fallStreak = 0;

    for (let i = 1; i < ticks.length; i++) {
        const diff = ticks[i].quote - ticks[i - 1].quote;
        if (diff > 0) {
            rises++;
            decided++;
        } else if (diff < 0) {
            falls++;
            decided++;
        }
    }

    for (let i = ticks.length - 1; i > 0; i--) {
        const diff = ticks[i].quote - ticks[i - 1].quote;
        if (diff <= 0) break;
        riseStreak++;
    }
    for (let i = ticks.length - 1; i > 0; i--) {
        const diff = ticks[i].quote - ticks[i - 1].quote;
        if (diff >= 0) break;
        fallStreak++;
    }

    const total = decided || 1;
    return [
        {
            label: 'Rise',
            qualifyingLabel: 'quote > prev',
            observedPct: (rises / total) * 100,
            theoreticalPct: 50,
            currentStreak: riseStreak,
        },
        {
            label: 'Fall',
            qualifyingLabel: 'quote < prev',
            observedPct: (falls / total) * 100,
            theoreticalPct: 50,
            currentStreak: fallStreak,
        },
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
