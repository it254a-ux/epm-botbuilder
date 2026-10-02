import { useMemo } from 'react';
import type { EpmTick } from './use-epm-tick-stats';
import './digit-stats-widget.scss';

interface DigitStatsWidgetProps {
    /** The live, buffered ticks (each carries its last digit). */
    ticks: EpmTick[];
    /** Digits to show with the filled blue "selected" circle (e.g. the barriers). */
    highlightDigits?: number[];
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Length of the bottom arc (degrees) for a given percentage. */
const arcDegrees = (pct: number) => {
    if (pct <= 0) return 0;
    return Math.min(350, Math.max(16, pct * 30 - 180));
};

/**
 * Live last-digit distribution: ten circles (0-9) showing each digit's share of
 * the buffered ticks. Most frequent digit = teal arc, least frequent = red arc,
 * the latest tick's digit is enlarged with a red pointer.
 */
function DigitStatsWidget({ ticks, highlightDigits = [] }: DigitStatsWidgetProps) {
    const { percentages, highest, lowest } = useMemo(() => {
        const counts = new Array(10).fill(0) as number[];
        ticks.forEach(t => {
            if (t.digit >= 0 && t.digit <= 9) counts[t.digit] += 1;
        });
        const total = counts.reduce((a, b) => a + b, 0);
        const pcts = counts.map(c => (total ? (c / total) * 100 : 0));
        if (!total) return { percentages: pcts, highest: -1, lowest: -1 };
        return {
            percentages: pcts,
            highest: pcts.indexOf(Math.max(...pcts)),
            lowest: pcts.indexOf(Math.min(...pcts)),
        };
    }, [ticks]);

    const currentDigit = ticks.length ? ticks[ticks.length - 1].digit : -1;

    return (
        <div className='digit-stats' aria-label='Live last digit statistics'>
            <div className='digit-stats__grid'>
                {DIGITS.map(d => {
                    const pct = percentages[d];
                    const deg = arcDegrees(pct);
                    const isCurrent = d === currentDigit;
                    const isSelected = highlightDigits.includes(d);
                    const arcClass =
                        d === highest ? 'digit-stats__arc--high' : d === lowest ? 'digit-stats__arc--low' : '';
                    return (
                        <div className='digit-stats__cell' key={d}>
                            <div
                                className={[
                                    'digit-stats__circle',
                                    isCurrent ? 'digit-stats__circle--current' : '',
                                    isSelected ? 'digit-stats__circle--selected' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                <svg className='digit-stats__svg' viewBox='0 0 100 100' aria-hidden='true'>
                                    <circle className='digit-stats__ring' cx='50' cy='50' r='44' />
                                    <circle
                                        className={`digit-stats__arc ${arcClass}`}
                                        cx='50'
                                        cy='50'
                                        r='44'
                                        pathLength={360}
                                        strokeDasharray={`${deg} ${360 - deg}`}
                                        style={{ transform: `rotate(${90 - deg / 2}deg)` }}
                                    />
                                </svg>
                                <div className='digit-stats__label'>
                                    <span className='digit-stats__digit'>{d}</span>
                                    <span className='digit-stats__pct'>{pct.toFixed(1)}%</span>
                                </div>
                                {isCurrent && <i className='digit-stats__pointer' />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default DigitStatsWidget;
