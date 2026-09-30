import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useDerivWS } from '@deriv/core';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import { Localize, localize } from '@deriv-com/translations';
import { useEpmTickStats, type EpmTick } from './use-epm-tick-stats';
import {
    analyzeOverUnder,
    analyzeRiseFall,
    analyzeOddEven,
    analyzeMatchDiffer,
    sourceTicksFor,
    type ContractType,
    type SideResult,
} from './contract-analysis';
import BotShortcuts from './bot-shortcuts';
import './epm-analysis-tool.scss';

const SYMBOL_GROUPS: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
    {
        label: '1s indices',
        options: [
            { value: '1HZ10V', label: 'Volatility 10 (1s)' },
            { value: '1HZ25V', label: 'Volatility 25 (1s)' },
            { value: '1HZ50V', label: 'Volatility 50 (1s)' },
            { value: '1HZ75V', label: 'Volatility 75 (1s)' },
            { value: '1HZ100V', label: 'Volatility 100 (1s)' },
        ],
    },
    {
        label: 'Standard indices',
        options: [
            { value: 'R_10', label: 'Volatility 10' },
            { value: 'R_25', label: 'Volatility 25' },
            { value: 'R_50', label: 'Volatility 50' },
            { value: 'R_75', label: 'Volatility 75' },
            { value: 'R_100', label: 'Volatility 100' },
        ],
    },
    {
        label: 'Jump indices',
        options: [
            { value: 'JD10', label: 'Jump 10' },
            { value: 'JD25', label: 'Jump 25' },
            { value: 'JD50', label: 'Jump 50' },
            { value: 'JD75', label: 'Jump 75' },
            { value: 'JD100', label: 'Jump 100' },
        ],
    },
];

const CONTRACT_OPTIONS: Array<{ value: ContractType; label: string; comingSoon?: boolean }> = [
    { value: 'over_under', label: 'Over/Under' },
    { value: 'rise_fall', label: 'Rise/Fall' },
    { value: 'odd_even', label: 'Odd/Even' },
    { value: 'match_differ', label: 'Digit Match/Differ' },
    { value: 'accumulator', label: 'Accumulators', comingSoon: true },
    { value: 'multiplier', label: 'Multiplier', comingSoon: true },
];

// Under 0 and Over 9 aren't real trades, so they're left out of these lists.
const UNDER_BARRIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const OVER_BARRIERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MATCH_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const DESKTOP_DRAWER_OPEN_WIDTH = 366;
const DESKTOP_DRAWER_CLOSED_WIDTH = 16;

const EpmAnalysisTool = observer(() => {
    const { run_panel } = useStore();
    const { isDesktop } = useDevice();
    const reservedWidth = isDesktop
        ? run_panel.is_drawer_open
            ? DESKTOP_DRAWER_OPEN_WIDTH
            : DESKTOP_DRAWER_CLOSED_WIDTH
        : 0;

    const [symbol, setSymbol] = useState('1HZ75V');
    const [contractType, setContractType] = useState<ContractType>('over_under');
    const [underBarrier, setUnderBarrier] = useState(2);
    const [overBarrier, setOverBarrier] = useState(7);
    const [matchDigit, setMatchDigit] = useState(5);
    const [windowN, setWindowN] = useState(10);
    const [thresholdPct, setThresholdPct] = useState(80);
    const [results, setResults] = useState<SideResult[] | null>(null);
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0); // 0..100
    const [scanStep, setScanStep] = useState(0);
    const [scanTotal, setScanTotal] = useState(0);

    const { ws, isConnected } = useDerivWS();
    const { ticks, status, errorMessage } = useEpmTickStats(ws, isConnected, symbol);

    const canAnalyze =
        status === 'analyzing' &&
        ticks.length >= windowN &&
        !scanning &&
        contractType !== 'accumulator' &&
        contractType !== 'multiplier';

    const computeAt = (window: EpmTick[], complete: boolean): SideResult[] | null => {
        switch (contractType) {
            case 'over_under':
                return analyzeOverUnder(window, thresholdPct, complete, underBarrier, overBarrier);
            case 'rise_fall':
                return analyzeRiseFall(window, thresholdPct, complete);
            case 'odd_even':
                return analyzeOddEven(window, thresholdPct, complete);
            case 'match_differ':
                return analyzeMatchDiffer(window, thresholdPct, complete, matchDigit);
            default:
                return null;
        }
    };

    // Real scan: steps through the actual last-N ticks one at a time --
    // each number shown mid-scan is a genuine result computed on that many
    // real ticks, not a placeholder. Paced (not instant) so the process is
    // visible; total scan time stays short regardless of how large N is.
    const runAnalysis = async () => {
        const source = sourceTicksFor(ticks, windowN, contractType);
        const revealCount = contractType === 'rise_fall' ? source.length - 1 : source.length;
        if (revealCount <= 0) return;

        setScanning(true);
        setResults(null);
        setScanTotal(revealCount);

        const TOTAL_DURATION_MS = 1400;
        const stepDelay = Math.max(15, Math.min(120, TOTAL_DURATION_MS / revealCount));

        for (let step = 1; step <= revealCount; step++) {
            const partialWindow = contractType === 'rise_fall' ? source.slice(0, step + 1) : source.slice(0, step);
            const complete = step === revealCount;
            setResults(computeAt(partialWindow, complete));
            setScanStep(step);
            setScanProgress(Math.round((step / revealCount) * 100));
            if (!complete) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise(resolve => setTimeout(resolve, stepDelay));
            }
        }

        setScanning(false);
    };

    // Reset the shown result whenever a setting changes, so a stale result
    // for a different pick/symbol/contract never sits on screen.
    const resetKey = `${symbol}|${contractType}|${underBarrier}|${overBarrier}|${matchDigit}|${windowN}|${thresholdPct}`;
    const [lastResetKey, setLastResetKey] = useState(resetKey);
    if (resetKey !== lastResetKey) {
        setLastResetKey(resetKey);
        if (results) setResults(null);
    }

    const flaggedSides = useMemo(() => (results ? results.filter(r => r.flagged).map(r => r.label) : []), [results]);
    const sideLabels = useMemo(() => {
        switch (contractType) {
            case 'over_under':
                return [`Under ${underBarrier}`, `Over ${overBarrier}`];
            case 'rise_fall':
                return ['Rise', 'Fall'];
            case 'odd_even':
                return ['Even', 'Odd'];
            case 'match_differ':
                return [`Matches ${matchDigit}`, `Differs ${matchDigit}`];
            default:
                return [];
        }
    }, [contractType, underBarrier, overBarrier, matchDigit]);

    return (
        <div
            className='epm-analysis-tool'
            style={{ width: `calc(100% - ${reservedWidth}px)`, transition: 'width 0.3s ease' }}
        >
            <h1 className='epm-analysis-tool__title'>
                <Localize i18n_default_text='EPM Analysis Tool' />
            </h1>

            <div className='epm-analysis-tool__panel'>
                <div className='epm-analysis-tool__picker-row'>
                    <div>
                        <label className='epm-analysis-tool__label'>
                            <Localize i18n_default_text='Volatility Index' />
                        </label>
                        <select className='epm-analysis-tool__select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                            {SYMBOL_GROUPS.map(group => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='epm-analysis-tool__label'>
                            <Localize i18n_default_text='Market Contract' />
                        </label>
                        <select
                            className='epm-analysis-tool__select'
                            value={contractType}
                            onChange={e => setContractType(e.target.value as ContractType)}
                        >
                            {CONTRACT_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                    {opt.comingSoon ? ` (${localize('coming soon')})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {contractType === 'over_under' && (
                        <>
                            <div>
                                <label className='epm-analysis-tool__label'>
                                    <Localize i18n_default_text='Under' />
                                </label>
                                <select
                                    className='epm-analysis-tool__select'
                                    value={underBarrier}
                                    onChange={e => setUnderBarrier(Number(e.target.value))}
                                >
                                    {UNDER_BARRIERS.map(n => (
                                        <option key={n} value={n}>
                                            {`Under ${n}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className='epm-analysis-tool__label'>
                                    <Localize i18n_default_text='Over' />
                                </label>
                                <select
                                    className='epm-analysis-tool__select'
                                    value={overBarrier}
                                    onChange={e => setOverBarrier(Number(e.target.value))}
                                >
                                    {OVER_BARRIERS.map(n => (
                                        <option key={n} value={n}>
                                            {`Over ${n}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {contractType === 'match_differ' && (
                        <div>
                            <label className='epm-analysis-tool__label'>
                                <Localize i18n_default_text='Digit' />
                            </label>
                            <select
                                className='epm-analysis-tool__select'
                                value={matchDigit}
                                onChange={e => setMatchDigit(Number(e.target.value))}
                            >
                                {MATCH_DIGITS.map(n => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {(contractType === 'over_under' ||
                        contractType === 'rise_fall' ||
                        contractType === 'odd_even' ||
                        contractType === 'match_differ') && (
                        <>
                            <div>
                                <label className='epm-analysis-tool__label'>
                                    <Localize i18n_default_text='Last N ticks' />
                                </label>
                                <input
                                    type='number'
                                    className='epm-analysis-tool__input'
                                    value={windowN}
                                    min={2}
                                    max={200}
                                    onChange={e => setWindowN(Math.max(2, Number(e.target.value)))}
                                />
                            </div>
                            <div>
                                <label className='epm-analysis-tool__label'>
                                    <Localize i18n_default_text='Flag at % fail' />
                                </label>
                                <input
                                    type='number'
                                    className='epm-analysis-tool__input'
                                    value={thresholdPct}
                                    min={0}
                                    max={100}
                                    onChange={e => setThresholdPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                                />
                            </div>
                        </>
                    )}
                </div>

                {(contractType === 'accumulator' || contractType === 'multiplier') ? (
                    <div className='epm-analysis-tool__note'>
                        <Localize i18n_default_text='Coming soon.' />
                    </div>
                ) : (
                    <div className='epm-analysis-tool__scan-row'>
                        <button className='epm-analysis-tool__btn-primary' onClick={runAnalysis} disabled={!canAnalyze}>
                            {scanning ? (
                                <Localize i18n_default_text='Scanning…' />
                            ) : (
                                <Localize i18n_default_text='Scan Market' />
                            )}
                        </button>
                        {scanning && (
                            <div className='epm-analysis-tool__scan-progress'>
                                <span
                                    className='epm-analysis-tool__scan-ring'
                                    style={{
                                        background: `conic-gradient(var(--button-primary-default) ${scanProgress * 3.6}deg, var(--general-section-2, var(--general-hover)) 0deg)`,
                                    }}
                                >
                                    <span className='epm-analysis-tool__scan-ring-inner'>{scanProgress}%</span>
                                </span>
                                <span className='epm-analysis-tool__scan-label'>
                                    {scanStep}/{scanTotal} <Localize i18n_default_text='ticks scanned' />
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <div className='epm-analysis-tool__status'>
                    <span
                        className={`epm-analysis-tool__dot epm-analysis-tool__dot--${
                            status === 'analyzing' ? 'live' : status === 'error' ? 'off' : 'idle'
                        }`}
                    />
                    <span>
                        {status === 'analyzing' && `${symbol} — ${ticks.length} ${localize('ticks buffered')}`}
                        {status === 'connecting' && localize('Connecting…')}
                        {status === 'error' && (errorMessage || localize('Connection error'))}
                    </span>
                </div>
            </div>

            {results && (
                <div className={`epm-analysis-tool__panel ${scanning ? 'epm-analysis-tool__panel--scanning' : ''}`}>
                    <table className='epm-analysis-tool__table'>
                        <thead>
                            <tr>
                                <th>
                                    <Localize i18n_default_text='Side' />
                                </th>
                                <th>
                                    <Localize i18n_default_text='Did not appear (last N)' />
                                </th>
                                <th>
                                    <Localize i18n_default_text='Result' />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map(row => (
                                <tr key={row.label}>
                                    <td>{row.label}</td>
                                    <td className='epm-analysis-tool__num'>
                                        {row.failPct.toFixed(1)}% ({row.failCount}/{row.sampleSize} of the relevant ticks)
                                    </td>
                                    <td>
                                        {row.flagged && (
                                            <span className='epm-analysis-tool__badge'>
                                                <Localize i18n_default_text='Rule met' />
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <BotShortcuts contractType={contractType} sides={results ? sideLabels : []} flaggedSides={flaggedSides} />
        </div>
    );
});

export default EpmAnalysisTool;
