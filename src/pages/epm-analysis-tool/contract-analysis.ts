import type { EpmTick } from './use-epm-tick-stats';

export type ContractType = 'over_under' | 'rise_fall' | 'odd_even' | 'match_differ' | 'accumulator' | 'multiplier';

export interface SideResult {
    label: string;
    /** % of the last N ticks that did NOT produce this outcome. */
    failPct: number;
    /** How many of the last N ticks were sampled (may be < N early in a session). */
    sampleSize: number;
    flagged: boolean;
}

const sideResult = (
    ticks: EpmTick[],
    windowN: number,
    thresholdPct: number,
    label: string,
    qualifies: (t: EpmTick, i: number, arr: EpmTick[]) => boolean
): SideResult => {
    const recent = ticks.slice(-windowN);
    const qualifyCount = recent.reduce((acc, t, i) => acc + (qualifies(t, i, recent) ? 1 : 0), 0);
    const failPct = recent.length ? ((recent.length - qualifyCount) / recent.length) * 100 : 0;
    return {
        label,
        failPct,
        sampleSize: recent.length,
        flagged: recent.length >= windowN && failPct >= thresholdPct,
    };
};

export function analyzeOverUnder(
    ticks: EpmTick[],
    windowN: number,
    thresholdPct: number,
    underBarrier: number,
    overBarrier: number
): SideResult[] {
    return [
        sideResult(ticks, windowN, thresholdPct, `Under ${underBarrier}`, t => t.digit < underBarrier),
        sideResult(ticks, windowN, thresholdPct, `Over ${overBarrier}`, t => t.digit > overBarrier),
    ];
}

export function analyzeRiseFall(ticks: EpmTick[], windowN: number, thresholdPct: number): SideResult[] {
    // Direction is relative to the previous tick, so it only exists from the 2nd tick on.
    const isRise = (t: EpmTick, i: number, arr: EpmTick[]) => i > 0 && t.quote > arr[i - 1].quote;
    const isFall = (t: EpmTick, i: number, arr: EpmTick[]) => i > 0 && t.quote < arr[i - 1].quote;
    return [
        sideResult(ticks, windowN, thresholdPct, 'Rise', isRise),
        sideResult(ticks, windowN, thresholdPct, 'Fall', isFall),
    ];
}

export function analyzeOddEven(ticks: EpmTick[], windowN: number, thresholdPct: number): SideResult[] {
    return [
        sideResult(ticks, windowN, thresholdPct, 'Even', t => t.digit % 2 === 0),
        sideResult(ticks, windowN, thresholdPct, 'Odd', t => t.digit % 2 !== 0),
    ];
}

export function analyzeMatchDiffer(
    ticks: EpmTick[],
    windowN: number,
    thresholdPct: number,
    digit: number
): SideResult[] {
    return [
        sideResult(ticks, windowN, thresholdPct, `Matches ${digit}`, t => t.digit === digit),
        sideResult(ticks, windowN, thresholdPct, `Differs ${digit}`, t => t.digit !== digit),
    ];
}
