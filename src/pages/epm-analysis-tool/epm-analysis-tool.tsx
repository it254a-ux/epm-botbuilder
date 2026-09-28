import { useMemo, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import { Localize, localize } from '@deriv-com/translations';
import { useEpmTickStats, fetchBacktestDigits, RECENT_TICKS_SHOWN } from './use-epm-tick-stats';
import {
    buildOverUnderRows,
    buildOddEvenRows,
    buildRiseFallRows,
    computeAccumulatorReading,
    type ContractType,
} from './contract-analysis';
import { runMartingaleBacktest, type BacktestResult } from './martingale-backtest';
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

function fmtPct(n: number) {
    return `${n.toFixed(1)}%`;
}

const CONTRACT_TYPES: Array<{ type: ContractType; name: string; description: string }> = [
    { type: 'rise_fall', name: 'Rise/Fall', description: 'Direction vs the previous tick — theoretical baseline 50/50.' },
    { type: 'odd_even', name: 'Odd/Even', description: "Last digit's parity — theoretical baseline 50/50." },
    { type: 'over_under', name: 'Over/Under', description: '80/20 splits only: Under 2 vs Over 1, and Over 7 vs Under 8.' },
    { type: 'accumulator', name: 'Accumulator', description: 'No digit split — reads current vs session volatility instead.' },
];

function EpmAnalysisTool() {
    const [symbol, setSymbol] = useState('1HZ75V');
    const [activeView, setActiveView] = useState<'live' | 'backtest'>('live');
    const [contractType, setContractType] = useState<ContractType>('over_under');

    // Same DerivWS connection mechanism Dtrader already uses successfully
    // elsewhere in this app -- public/unauthenticated, no login required
    // for tick data. No manual "Connect" step: it connects on mount and
    // stays connected while this tab is open.
    const { ws, isConnected } = useDerivWS();
    const { ticks, status, errorMessage } = useEpmTickStats(ws, isConnected, symbol);

    const contractRows = useMemo(() => {
        switch (contractType) {
            case 'over_under':
                return buildOverUnderRows(ticks);
            case 'odd_even':
                return buildOddEvenRows(ticks);
            case 'rise_fall':
                return buildRiseFallRows(ticks);
            default:
                return null;
        }
    }, [ticks, contractType]);

    const accumulatorReading = useMemo(
        () => (contractType === 'accumulator' ? computeAccumulatorReading(ticks) : null),
        [ticks, contractType]
    );

    const { digitCounts, lastDigit, streakUnder2, longestStreakUnder2 } = useMemo(() => {
        const counts = new Array(10).fill(0);
        let curStreak = 0;
        let longest = 0;
        ticks.forEach(t => {
            counts[t.digit]++;
            if (t.digit < 2) {
                if (curStreak > longest) longest = curStreak;
                curStreak = 0;
            } else {
                curStreak++;
            }
        });
        if (curStreak > longest) longest = curStreak;
        return {
            digitCounts: counts,
            lastDigit: ticks.length ? ticks[ticks.length - 1].digit : null,
            streakUnder2: curStreak,
            longestStreakUnder2: longest,
        };
    }, [ticks]);

    const maxDigitCount = Math.max(1, ...digitCounts);
    const recentTicks = ticks.slice(-RECENT_TICKS_SHOWN);

    // ---- Backtester ----
    const [btCount, setBtCount] = useState(3000);
    const [btDirection, setBtDirection] = useState<'under' | 'over'>('under');
    const [btThreshold, setBtThreshold] = useState(2);
    const [btStreak, setBtStreak] = useState(8);
    const [btStake, setBtStake] = useState(1);
    const [btMult, setBtMult] = useState(2);
    const [btMaxSteps, setBtMaxSteps] = useState(6);
    const [btPayout, setBtPayout] = useState(4.9);
    const [btBusy, setBtBusy] = useState(false);
    const [btStatusText, setBtStatusText] = useState(localize('Idle'));
    const [btResult, setBtResult] = useState<BacktestResult | null>(null);

    const runBacktest = async () => {
        if (!ws || !isConnected) return;
        setBtBusy(true);
        setBtStatusText(localize('Fetching {{count}} historical ticks for {{symbol}}…', { count: btCount, symbol }));
        try {
            const digits = await fetchBacktestDigits(ws, symbol, btCount);
            setBtStatusText(localize('Fetched {{count}} ticks. Running backtest…', { count: digits.length }));
            const result = runMartingaleBacktest(digits, {
                direction: btDirection,
                threshold: btThreshold,
                streakTrigger: btStreak,
                baseStake: btStake,
                multiplier: btMult,
                maxSteps: btMaxSteps,
                payoutMultiplier: btPayout,
            });
            setBtResult(result);
            setBtStatusText(localize('Done — {{count}} ticks analyzed for {{symbol}}', { count: digits.length, symbol }));
        } catch (err) {
            setBtStatusText(err instanceof Error ? err.message : localize('Backtest failed — try again.'));
        } finally {
            setBtBusy(false);
        }
    };

    return (
        <div className='epm-analysis-tool'>
            <h1 className='epm-analysis-tool__title'>
                <Localize i18n_default_text='EPM Analysis Tool' />
            </h1>
            <div className='epm-analysis-tool__subtitle'>
                <Localize i18n_default_text='Live statistical analysis and strategy backtesting for synthetic index tick data.' />
            </div>

            <div className='epm-analysis-tool__layout'>
                {/* LEFT: connection + reference */}
                <div>
                    <div className='epm-analysis-tool__panel'>
                        <h2 className='epm-analysis-tool__panel-title'>
                            <Localize i18n_default_text='Connection' />
                        </h2>
                        <label className='epm-analysis-tool__label'>
                            <Localize i18n_default_text='Volatility Index' />
                        </label>
                        <select
                            className='epm-analysis-tool__select'
                            value={symbol}
                            onChange={e => setSymbol(e.target.value)}
                        >
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
                        <div className='epm-analysis-tool__status'>
                            <span
                                className={`epm-analysis-tool__dot epm-analysis-tool__dot--${
                                    status === 'analyzing' ? 'live' : status === 'error' ? 'off' : 'idle'
                                }`}
                            />
                            <span>
                                {status === 'analyzing' && `${localize('Analyzing')} — ${symbol}`}
                                {status === 'connecting' && localize('Connecting…')}
                                {status === 'error' && (errorMessage || localize('Connection error'))}
                            </span>
                        </div>
                    </div>

                    <div className='epm-analysis-tool__panel'>
                        <h2 className='epm-analysis-tool__panel-title'>
                            <Localize i18n_default_text='Contract Type' />
                        </h2>
                        <div className='epm-analysis-tool__contract-grid'>
                            {CONTRACT_TYPES.map(c => (
                                <div
                                    key={c.type}
                                    className={`epm-analysis-tool__contract-card ${
                                        contractType === c.type ? 'epm-analysis-tool__contract-card--active' : ''
                                    }`}
                                    onClick={() => setContractType(c.type)}
                                >
                                    <h3>{c.name}</h3>
                                    <p>{c.description}</p>
                                </div>
                            ))}
                        </div>
                        <div className='epm-analysis-tool__note'>
                            <Localize i18n_default_text='Choosing a type changes the result on the right to what that contract actually settles on — it does not make one type "better" for a given streak.' />
                        </div>
                    </div>
                </div>

                {/* RIGHT: live tracker / backtester */}
                <div>
                    <div className='epm-analysis-tool__tabs'>
                        <div
                            className={`epm-analysis-tool__tab ${activeView === 'live' ? 'epm-analysis-tool__tab--active' : ''}`}
                            onClick={() => setActiveView('live')}
                        >
                            <Localize i18n_default_text='Live Tracker' />
                        </div>
                        <div
                            className={`epm-analysis-tool__tab ${activeView === 'backtest' ? 'epm-analysis-tool__tab--active' : ''}`}
                            onClick={() => setActiveView('backtest')}
                        >
                            <Localize i18n_default_text='Martingale Backtester' />
                        </div>
                    </div>

                    {activeView === 'live' && (
                        <>
                            <div className='epm-analysis-tool__panel'>
                                <h2 className='epm-analysis-tool__panel-title'>
                                    <Localize i18n_default_text='Session Stats' /> <span className='epm-analysis-tool__muted'>· {symbol}</span>
                                </h2>
                                <div className='epm-analysis-tool__statgrid'>
                                    <div className='epm-analysis-tool__stat'>
                                        <div className='epm-analysis-tool__stat-n'>{ticks.length}</div>
                                        <div className='epm-analysis-tool__stat-l'>
                                            <Localize i18n_default_text='ticks observed' />
                                        </div>
                                    </div>
                                    <div className='epm-analysis-tool__stat'>
                                        <div className='epm-analysis-tool__stat-n'>{lastDigit ?? '–'}</div>
                                        <div className='epm-analysis-tool__stat-l'>
                                            <Localize i18n_default_text='last digit' />
                                        </div>
                                    </div>
                                    <div className='epm-analysis-tool__stat'>
                                        <div className='epm-analysis-tool__stat-n'>{streakUnder2}</div>
                                        <div className='epm-analysis-tool__stat-l'>
                                            <Localize i18n_default_text='ticks since digit < 2' />
                                        </div>
                                    </div>
                                    <div className='epm-analysis-tool__stat'>
                                        <div className='epm-analysis-tool__stat-n'>{Math.max(longestStreakUnder2, streakUnder2)}</div>
                                        <div className='epm-analysis-tool__stat-l'>
                                            <Localize i18n_default_text='longest streak (session)' />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className='epm-analysis-tool__panel'>
                                <h2 className='epm-analysis-tool__panel-title'>
                                    <Localize i18n_default_text='Contract Result' />{' '}
                                    <span className='epm-analysis-tool__muted'>
                                        · {CONTRACT_TYPES.find(c => c.type === contractType)?.name}
                                    </span>
                                </h2>

                                {contractRows && (
                                    <table className='epm-analysis-tool__table'>
                                        <thead>
                                            <tr>
                                                <th>Side</th>
                                                <th>Qualifies</th>
                                                <th>Observed</th>
                                                <th>Theory</th>
                                                <th>Streak</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {contractRows.map((row, i) => (
                                                <tr key={row.label}>
                                                    <td>{row.label}</td>
                                                    <td className='epm-analysis-tool__num'>{row.qualifyingLabel}</td>
                                                    <td>
                                                        <div className='epm-analysis-tool__bar-bg'>
                                                            <div
                                                                className={`epm-analysis-tool__bar-fill ${row.theoreticalPct === 20 || (row.theoreticalPct === 50 && i === 1) ? 'epm-analysis-tool__bar-fill--alt' : ''}`}
                                                                style={{ width: `${Math.min(row.observedPct, 100)}%` }}
                                                            />
                                                        </div>
                                                        <div className='epm-analysis-tool__bar-label'>{fmtPct(row.observedPct)}</div>
                                                    </td>
                                                    <td className='epm-analysis-tool__num'>{fmtPct(row.theoreticalPct)}</td>
                                                    <td className='epm-analysis-tool__num'>{row.currentStreak}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {contractType === 'accumulator' &&
                                    (accumulatorReading ? (
                                        <div className='epm-analysis-tool__statgrid'>
                                            <div className='epm-analysis-tool__stat'>
                                                <div className='epm-analysis-tool__stat-n'>
                                                    {accumulatorReading.recentVolatilityPct.toFixed(3)}%
                                                </div>
                                                <div className='epm-analysis-tool__stat-l'>
                                                    <Localize i18n_default_text='recent avg. move (last 100 ticks)' />
                                                </div>
                                            </div>
                                            <div className='epm-analysis-tool__stat'>
                                                <div className='epm-analysis-tool__stat-n'>
                                                    {accumulatorReading.sessionVolatilityPct.toFixed(3)}%
                                                </div>
                                                <div className='epm-analysis-tool__stat-l'>
                                                    <Localize i18n_default_text='session avg. move' />
                                                </div>
                                            </div>
                                            <div className='epm-analysis-tool__stat'>
                                                <div className='epm-analysis-tool__stat-n'>{accumulatorReading.sampleSize}</div>
                                                <div className='epm-analysis-tool__stat-l'>
                                                    <Localize i18n_default_text='ticks sampled' />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className='epm-analysis-tool__muted'>
                                            <Localize i18n_default_text='Collecting ticks…' />
                                        </div>
                                    ))}

                                <div className='epm-analysis-tool__note'>
                                    {contractType === 'over_under' && (
                                        <Localize i18n_default_text='Shows the 80/20 splits only (Under 2 / Over 1 and Over 7 / Under 8) — not a sweep of every barrier.' />
                                    )}
                                    {contractType === 'odd_even' && (
                                        <Localize i18n_default_text='Even and Odd are structurally 50/50 for a fair generator — persistent deviation here would be unusual, not a signal to chase.' />
                                    )}
                                    {contractType === 'rise_fall' && (
                                        <Localize i18n_default_text='Rise/Fall on a synthetic index has no memory between ticks — this is a live read, not a forecast of the next one.' />
                                    )}
                                    {contractType === 'accumulator' && (
                                        <Localize i18n_default_text='Purely descriptive — a busier recent window than the session average is not a cue to enter or exit.' />
                                    )}
                                </div>
                            </div>

                            <div className='epm-analysis-tool__cols-2'>
                                <div className='epm-analysis-tool__panel'>
                                    <h2 className='epm-analysis-tool__panel-title'>
                                        <Localize i18n_default_text='Last-Digit Distribution' />
                                    </h2>
                                    <div className='epm-analysis-tool__digit-chart'>
                                        {digitCounts.map((count, digit) => (
                                            <div className='epm-analysis-tool__digit-bar-col' key={digit}>
                                                <div className='epm-analysis-tool__digit-bar-track'>
                                                    <div
                                                        className='epm-analysis-tool__digit-bar-fill'
                                                        style={{ height: `${(count / maxDigitCount) * 100}%` }}
                                                    />
                                                </div>
                                                <div className='epm-analysis-tool__digit-bar-label'>{digit}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className='epm-analysis-tool__panel'>
                                    <h2 className='epm-analysis-tool__panel-title'>
                                        <Localize i18n_default_text='Recent Ticks' />
                                    </h2>
                                    <div className='epm-analysis-tool__ticklog'>
                                        {recentTicks.map((t, i) => (
                                            <div
                                                key={`${t.epoch}-${i}`}
                                                className={`epm-analysis-tool__digit ${t.digit < 2 ? 'epm-analysis-tool__digit--low' : ''}`}
                                            >
                                                {t.digit}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className='epm-analysis-tool__note'>
                                <Localize i18n_default_text='Frequencies converge toward theoretical values as sample size grows — early deviation is sampling noise, not a market condition.' />
                            </div>
                        </>
                    )}

                    {activeView === 'backtest' && (
                        <div className='epm-analysis-tool__cols-2 epm-analysis-tool__cols-2--backtest'>
                            <div className='epm-analysis-tool__panel'>
                                <h2 className='epm-analysis-tool__panel-title'>
                                    <Localize i18n_default_text='Backtest Setup' />
                                </h2>
                                <div className='epm-analysis-tool__row'>
                                    <div>
                                        <label className='epm-analysis-tool__label'>
                                            <Localize i18n_default_text='History (ticks)' />
                                        </label>
                                        <select
                                            className='epm-analysis-tool__select'
                                            value={btCount}
                                            onChange={e => setBtCount(Number(e.target.value))}
                                        >
                                            <option value={1000}>1,000</option>
                                            <option value={3000}>3,000</option>
                                            <option value={5000}>5,000 (max)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className='epm-analysis-tool__label'>
                                            <Localize i18n_default_text='Direction' />
                                        </label>
                                        <select
                                            className='epm-analysis-tool__select'
                                            value={btDirection}
                                            onChange={e => setBtDirection(e.target.value as 'under' | 'over')}
                                        >
                                            <option value='under'>Under</option>
                                            <option value='over'>Over</option>
                                        </select>
                                    </div>
                                </div>
                                <div className='epm-analysis-tool__row'>
                                    <div>
                                        <label className='epm-analysis-tool__label'>
                                            <Localize i18n_default_text='Threshold' />
                                        </label>
                                        <select
                                            className='epm-analysis-tool__select'
                                            value={btThreshold}
                                            onChange={e => setBtThreshold(Number(e.target.value))}
                                        >
                                            {[2, 3, 4, 5, 6, 7].map(n => (
                                                <option key={n} value={n}>
                                                    {n}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className='epm-analysis-tool__label'>
                                            <Localize i18n_default_text='Enter after streak ≥' />
                                        </label>
                                        <input
                                            type='number'
                                            className='epm-analysis-tool__input'
                                            value={btStreak}
                                            min={1}
                                            max={50}
                                            onChange={e => setBtStreak(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                                <div className='epm-analysis-tool__row'>
                                    <div>
                                        <label className='epm-analysis-tool__label'>
                                            <Localize i18n_default_text='Base stake' />
                                        </label>
                                        <input
                                            type='number'
                                            className='epm-analysis-tool__input'
                                            value={btStake}
                                            min={0.1}
                                            step={0.1}
                                            onChange={e => setBtStake(Number(e.target.value))}
                                        />
                                    </div>
                                    <div>
                                        <label className='epm-analysis-tool__label'>
                                            <Localize i18n_default_text='Martingale mult. on loss' />
                                        </label>
                                        <input
                                            type='number'
                                            className='epm-analysis-tool__input'
                                            value={btMult}
                                            min={1}
                                            step={0.1}
                                            onChange={e => setBtMult(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                                <label className='epm-analysis-tool__label'>
                                    <Localize i18n_default_text='Max martingale steps before reset' />
                                </label>
                                <input
                                    type='number'
                                    className='epm-analysis-tool__input'
                                    value={btMaxSteps}
                                    min={1}
                                    max={15}
                                    onChange={e => setBtMaxSteps(Number(e.target.value))}
                                />
                                <label className='epm-analysis-tool__label'>
                                    <Localize i18n_default_text="Payout mult. on win (check your broker's real payout)" />
                                </label>
                                <input
                                    type='number'
                                    className='epm-analysis-tool__input'
                                    value={btPayout}
                                    min={1}
                                    step={0.01}
                                    onChange={e => setBtPayout(Number(e.target.value))}
                                />
                                <div className='epm-analysis-tool__note'>
                                    <Localize i18n_default_text="Narrower bands pay more per win because they hit less often — a reshaping of variance, not extra edge." />
                                </div>
                                <button
                                    className='epm-analysis-tool__btn-primary'
                                    onClick={runBacktest}
                                    disabled={btBusy || !isConnected}
                                >
                                    <Localize i18n_default_text='Run Backtest' />
                                </button>
                                <div className='epm-analysis-tool__status'>
                                    <span className={`epm-analysis-tool__dot epm-analysis-tool__dot--${btBusy ? 'live' : 'idle'}`} />
                                    <span>{btStatusText}</span>
                                </div>
                            </div>

                            {btResult ? (
                                <div className='epm-analysis-tool__panel'>
                                    <h2 className='epm-analysis-tool__panel-title'>
                                        <Localize i18n_default_text='Result — Equity Curve' />
                                    </h2>
                                    <div className='epm-analysis-tool__equity-chart'>
                                        {btResult.equityCurve.map((v, i) => {
                                            const maxAbs = Math.max(1, ...btResult.equityCurve.map(Math.abs));
                                            const heightPct = (Math.abs(v) / maxAbs) * 50;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`epm-analysis-tool__equity-bar ${v >= 0 ? 'epm-analysis-tool__equity-bar--pos' : 'epm-analysis-tool__equity-bar--neg'}`}
                                                    style={{ height: `${heightPct}%` }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className='epm-analysis-tool__statgrid'>
                                        <div className='epm-analysis-tool__stat'>
                                            <div className='epm-analysis-tool__stat-n'>{btResult.triggers}</div>
                                            <div className='epm-analysis-tool__stat-l'>
                                                <Localize i18n_default_text='triggers' />
                                            </div>
                                        </div>
                                        <div className='epm-analysis-tool__stat'>
                                            <div className='epm-analysis-tool__stat-n'>
                                                {btResult.triggers ? fmtPct((btResult.wins / btResult.triggers) * 100) : '–'}
                                            </div>
                                            <div className='epm-analysis-tool__stat-l'>
                                                <Localize i18n_default_text='win rate' />
                                            </div>
                                        </div>
                                        <div className='epm-analysis-tool__stat'>
                                            <div className='epm-analysis-tool__stat-n'>{btResult.maxDrawdown.toFixed(2)}</div>
                                            <div className='epm-analysis-tool__stat-l'>
                                                <Localize i18n_default_text='max drawdown' />
                                            </div>
                                        </div>
                                        <div className='epm-analysis-tool__stat'>
                                            <div className='epm-analysis-tool__stat-n'>{btResult.longestLossRun}</div>
                                            <div className='epm-analysis-tool__stat-l'>
                                                <Localize i18n_default_text='longest loss run' />
                                            </div>
                                        </div>
                                        <div className='epm-analysis-tool__stat'>
                                            <div className='epm-analysis-tool__stat-n'>{btResult.ruins}</div>
                                            <div className='epm-analysis-tool__stat-l'>
                                                <Localize i18n_default_text='ruin events' />
                                            </div>
                                        </div>
                                        <div className='epm-analysis-tool__stat'>
                                            <div className='epm-analysis-tool__stat-n'>
                                                {btResult.finalEquity >= 0 ? '+' : ''}
                                                {btResult.finalEquity.toFixed(2)}
                                            </div>
                                            <div className='epm-analysis-tool__stat-l'>
                                                <Localize i18n_default_text='net P/L' />
                                            </div>
                                        </div>
                                    </div>
                                    <div className='epm-analysis-tool__note'>
                                        {btResult.ruins > 0 ? (
                                            <Localize
                                                i18n_default_text='{{ruins}} time(s) the losing streak exceeded your max martingale steps within this sample — your staking plan would have hit its ceiling and stopped compounding stakes. A win-rate figure alone would not have shown you this.'
                                                values={{ ruins: btResult.ruins }}
                                            />
                                        ) : (
                                            <Localize i18n_default_text='No ruin event occurred in this sample. That does not mean the strategy is safe — only that the longest losing streak in this window stayed within your configured max steps. Re-run with more history before trusting it.' />
                                        )}
                                    </div>

                                    <h2 className='epm-analysis-tool__panel-title' style={{ marginTop: 12 }}>
                                        <Localize i18n_default_text='Trigger Occurrences' />
                                    </h2>
                                    <div className='epm-analysis-tool__trigger-log'>
                                        <table className='epm-analysis-tool__table'>
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Tick</th>
                                                    <th>Streak</th>
                                                    <th>Outcome</th>
                                                    <th>Digit</th>
                                                    <th>Stake</th>
                                                    <th>Result</th>
                                                    <th>Equity</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {btResult.triggerLog.map((row, i) => (
                                                    <tr key={i}>
                                                        <td className='epm-analysis-tool__num'>{row.n}</td>
                                                        <td className='epm-analysis-tool__num'>{row.tickIndex}</td>
                                                        <td className='epm-analysis-tool__num'>{row.streak}</td>
                                                        <td className={row.outcome === 'WIN' ? 'epm-analysis-tool__win' : 'epm-analysis-tool__loss'}>
                                                            {row.outcome}
                                                        </td>
                                                        <td className='epm-analysis-tool__num'>{row.digit}</td>
                                                        <td className='epm-analysis-tool__num'>{row.stake}</td>
                                                        <td className={`epm-analysis-tool__num ${row.result.startsWith('+') ? 'epm-analysis-tool__win' : 'epm-analysis-tool__loss'}`}>
                                                            {row.result}
                                                        </td>
                                                        <td className='epm-analysis-tool__num'>{row.equity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className='epm-analysis-tool__note epm-analysis-tool__note--warn'>
                                        <Localize i18n_default_text='Replays your rule against one historical sample — not proof of a real edge. Re-run across different indices and windows before trusting it.' />
                                    </div>
                                </div>
                            ) : (
                                <div className='epm-analysis-tool__panel epm-analysis-tool__empty-hint'>
                                    <Localize i18n_default_text='Set your parameters and run a backtest to see results here.' />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default EpmAnalysisTool;
