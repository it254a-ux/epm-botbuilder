import type { EpmTick } from './use-epm-tick-stats';

export type ContractType = 'over_under' | 'rise_fall' | 'odd_even' | 'match_differ' | 'accumulator' | 'multiplier';

export interface SideResult {
    label: string;
    /** % of the ticks scanned so far that did NOT produce this outcome. */
    failPct: number;
    /** How many ticks have been scanned so far (grows to windowN as the scan runs). */
    sampleSize: number;
    /** True only once the scan has gone through the full window -- never during a partial reveal. */
    flagged: boolean;
}

const sideResult = (
    window: EpmTick[],
    thresholdPct: number,
    targetN: number,
    complete: boolean,
    label: string,
    qualifies: (t: EpmTick, i: number, arr: EpmTick[]) => boolean
): SideResult => {
    const qualifyCount = window.reduce((acc, t, i) => acc + (qualifies(t, i, window) ? 1 : 0), 0);
    const failPct = window.length ? ((window.length - qualifyCount) / window.length) * 100 : 0;
    return {
        label,
        failPct,
        sampleSize: window.length,
        flagged: complete && window.length >= targetN && failPct >= thresholdPct,
    };
};

/** Direction is relative to the previous tick, so a `window` for Rise/Fall
 *  should include one extra tick before the N being counted -- see
 *  `sourceTicksFor` below, which handles that. */
const isRise = (t: EpmTick, i: number, arr: EpmTick[]) => i > 0 && t.quote > arr[i - 1].quote;
const isFall = (t: EpmTick, i: number, arr: EpmTick[]) => i > 0 && t.quote < arr[i - 1].quote;

export function analyzeOverUnder(
    window: EpmTick[],
    thresholdPct: number,
    targetN: number,
    complete: boolean,
    underBarrier: number,
    overBarrier: number
): SideResult[] {
    return [
        sideResult(window, thresholdPct, targetN, complete, `Under ${underBarrier}`, t => t.digit < underBarrier),
        sideResult(window, thresholdPct, targetN, complete, `Over ${overBarrier}`, t => t.digit > overBarrier),
    ];
}

export function analyzeRiseFall(window: EpmTick[], thresholdPct: number, targetN: number, complete: boolean): SideResult[] {
    return [
        sideResult(window, thresholdPct, targetN, complete, 'Rise', isRise),
        sideResult(window, thresholdPct, targetN, complete, 'Fall', isFall),
    ];
}

export function analyzeOddEven(window: EpmTick[], thresholdPct: number, targetN: number, complete: boolean): SideResult[] {
    return [
        sideResult(window, thresholdPct, targetN, complete, 'Even', t => t.digit % 2 === 0),
        sideResult(window, thresholdPct, targetN, complete, 'Odd', t => t.digit % 2 !== 0),
    ];
}

export function analyzeMatchDiffer(
    window: EpmTick[],
    thresholdPct: number,
    targetN: number,
    complete: boolean,
    digit: number
): SideResult[] {
    return [
        sideResult(window, thresholdPct, targetN, complete, `Matches ${digit}`, t => t.digit === digit),
        sideResult(window, thresholdPct, targetN, complete, `Differs ${digit}`, t => t.digit !== digit),
    ];
}

/** The real tick data a scan will step through, taken once at the moment
 *  Scan Market is pressed. Rise/Fall needs one extra leading tick so its
 *  very first counted tick still has a previous tick to compare against. */
export function sourceTicksFor(ticks: EpmTick[], windowN: number, contractType: ContractType): EpmTick[] {
    return contractType === 'rise_fall' ? ticks.slice(-(windowN + 1)) : ticks.slice(-windowN);
}
