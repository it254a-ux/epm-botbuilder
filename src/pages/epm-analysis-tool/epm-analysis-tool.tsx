import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useBotLoader } from './use-bot-loader';
import { resolveBot, readChoices } from './bot-resolution';
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
    const [mode, setMode] = useState<'manual' | 'automatic'>('manual');
    const [autoMessage, setAutoMessage] = useState<string | null>(null);
    const EXTRA_LIVE_TICKS = 5;
    const [confirmThresholdPct, setConfirmThresholdPct] = useState(90);
    const { bots, loadBot } = useBotLoader();
    const [scanProgress, setScanProgress] = useState(0); // 0..100
    const [scanStep, setScanStep] = useState(0);
    const [scanTotal, setScanTotal] = useState(0);

    const { ws, isConnected } = useDerivWS();
    const { run_panel: runPanelForAuto } = useStore();
    const { ticks, status, errorMessage } = useEpmTickStats(ws, isConnected, symbol);

    // Mirrors `ticks` so the next-5 confirmation loop (running inside an
    // async function whose closure was fixed at click time) can always read
    // the latest live ticks as they arrive, not a stale snapshot.
    const ticksRef = useRef(ticks);
    useEffect(() => {
        ticksRef.current = ticks;
    }, [ticks]);

    // Bots call the page's native alert() to post a message while running
    // (e.g. "CONTINUOUS TRADER - UNDER 4, EVERY TICK"). While this page is
    // open, replace it with a styled in-panel notice instead of the
    // browser's native popup -- same message, shown in the Run panel.
    const [botNotice, setBotNotice] = useState<string | null>(null);
    useEffect(() => {
        const originalAlert = window.alert;
        window.alert = (message?: unknown) => {
            setBotNotice(message === undefined ? '' : String(message));
        };
        return () => {
            window.alert = originalAlert;
        };
    }, []);

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
        const bufferedCount = contractType === 'rise_fall' ? source.length - 1 : source.length;
        if (bufferedCount <= 0) return;
        const totalCount = bufferedCount + EXTRA_LIVE_TICKS;

        setScanning(true);
        setResults(null);
        setAutoMessage(null);
        setScanTotal(totalCount);

        const TOTAL_DURATION_MS = 1400;
        const stepDelay = Math.max(15, Math.min(120, TOTAL_DURATION_MS / bufferedCount));

        let finalResult: SideResult[] | null = null;

        // Phase 1: the already-buffered last N ticks -- fast, paced reveal.
        for (let step = 1; step <= bufferedCount; step++) {
            const partialWindow = contractType === 'rise_fall' ? source.slice(0, step + 1) : source.slice(0, step);
            const complete = step === totalCount; // only true if EXTRA_LIVE_TICKS is 0
            const stepResult = computeAt(partialWindow, complete);
            setResults(stepResult);
            if (complete) finalResult = stepResult;
            setScanStep(step);
            setScanProgress(Math.round((step / totalCount) * 100));
            if (!complete) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise(resolve => setTimeout(resolve, stepDelay));
            }
        }

        // Phase 2: keeps extending the SAME window with real new ticks as
        // they arrive live -- one continuous result over all
        // bufferedCount + EXTRA_LIVE_TICKS ticks, not a separate number.
        let combined = source.slice();
        const startLen = ticksRef.current.length;
        for (let extra = 1; extra <= EXTRA_LIVE_TICKS; extra++) {
            while (ticksRef.current.length < startLen + extra) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            combined = [...combined, ticksRef.current[startLen + extra - 1]];
            const step = bufferedCount + extra;
            const complete = step === totalCount;
            const stepResult = computeAt(combined, complete);
            setResults(stepResult);
            if (complete) finalResult = stepResult;
            setScanStep(step);
            setScanProgress(Math.round((step / totalCount) * 100));
        }

        setScanning(false);

        const flagged = finalResult?.find(r => r.flagged);
        if (!flagged) {
            if (mode === 'automatic') setAutoMessage(localize('Scan finished — no side met the rule this time.'));
            return;
        }

        if (mode === 'automatic' && flagged.failPct < confirmThresholdPct) {
            setAutoMessage(
                localize('{{side}} is at {{pct}}% (needs {{needed}}%+) — not running.', {
                    side: flagged.label,
                    pct: flagged.failPct.toFixed(0),
                    needed: confirmThresholdPct,
                })
            );
            return;
        }

        if (mode === 'automatic') {
            const bot = resolveBot(bots, contractType, flagged.label, readChoices());
            if (!bot) {
                setAutoMessage(
                    localize('{{side}} met the rule, but no bot is set for it yet — pick one under "Your bots" first.', {
                        side: flagged.label,
                    })
                );
                return;
            }
            setAutoMessage(localize('{{side}} met the rule — loading {{bot}}…', { side: flagged.label, bot: bot.name }));
            await loadBot(bot);
            setAutoMessage(localize('Running {{bot}}…', { bot: bot.name }));
            await runPanelForAuto.onRunButtonClick();
            setAutoMessage(
                localize('{{bot}} is running on {{side}}. Stop it from the Run panel, or wait for TP/SL.', {
                    bot: bot.name,
                    side: flagged.label,
                })
            );
        }
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

            <div className='epm-analysis-tool__mode-row'>
                <label className='epm-analysis-tool__mode-option'>
                    <input
                        type='radio'
                        name='epm-mode'
                        checked={mode === 'manual'}
                        onChange={() => setMode('manual')}
                    />
                    <span>
                        <Localize i18n_default_text='Manual — I load and run the bot myself' />
                    </span>
                </label>
                <label className='epm-analysis-tool__mode-option'>
                    <input
                        type='radio'
                        name='epm-mode'
                        checked={mode === 'automatic'}
                        onChange={() => setMode('automatic')}
                    />
                    <span>
                        <Localize i18n_default_text='Automatic — load and run the bot for me when the rule is met' />
                    </span>
                </label>
                {mode === 'automatic' && (
                    <label className='epm-analysis-tool__mode-option'>
                        <span>
                            <Localize i18n_default_text='Only run at scan %' />
                        </span>
                        <input
                            type='number'
                            className='epm-analysis-tool__input'
                            value={confirmThresholdPct}
                            min={0}
                            max={100}
                            onChange={e => setConfirmThresholdPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                        />
                    </label>
                )}
            </div>

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
                                    <Localize i18n_default_text='Look back N ticks (+5 live)' />
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
                            ) : mode === 'automatic' ? (
                                <Localize i18n_default_text='Scan & Trade' />
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

                {mode === 'automatic' && autoMessage && <div className='epm-analysis-tool__note'>{autoMessage}</div>}
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

            {botNotice !== null && (
                <div
                    className='epm-analysis-tool__notice-overlay'
                    style={isDesktop ? { width: `${DESKTOP_DRAWER_OPEN_WIDTH}px` } : undefined}
                >
                    <div className='epm-analysis-tool__notice-card'>
                        <div className='epm-analysis-tool__notice-header'>
                            <span className='epm-analysis-tool__notice-icon'>◆</span>
                            <Localize i18n_default_text='Strategy Notice' />
                        </div>
                        <div className='epm-analysis-tool__notice-body'>{botNotice || localize('(no message)')}</div>
                        <div className='epm-analysis-tool__notice-actions'>
                            <button
                                type='button'
                                className='epm-analysis-tool__notice-cancel'
                                onClick={() => {
                                    setBotNotice(null);
                                    runPanelForAuto.onStopButtonClick();
                                }}
                            >
                                <Localize i18n_default_text='Stop Trading' />
                            </button>
                            <button
                                type='button'
                                className='epm-analysis-tool__notice-ok'
                                onClick={() => setBotNotice(null)}
                            >
                                <Localize i18n_default_text='Acknowledge & Continue' />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default EpmAnalysisTool;
