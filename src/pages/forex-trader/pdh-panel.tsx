import type { PdhResult } from './pdh';

interface Props {
    result: PdhResult | null;
    fmt: (n: number) => string;
    marketClosed: boolean;
}

const gmt = (t: number) => {
    const d = new Date(t * 1000);
    return `${d.toUTCString().slice(5, 11)} ${d.toISOString().slice(11, 16)} GMT`;
};

/**
 * Previous Day High / Low rejection, shown inside the M15 + M5 mode. The labels on the chart use exactly the names below,
 * so a student can read the chart and this card with the same words.
 */
const PdhPanel = ({ result, fmt, marketClosed }: Props) => {
    if (marketClosed || !result) return null;
    const tone = result.stage === 'confirmed' ? (result.side === 'BUY' ? 'buy' : 'sell') : 'wait';
    const pill = result.stage === 'confirmed' ? `CONFIRMED ${result.side}` : result.stage === 'watch' ? 'WATCH: DO NOT ENTER YET' : 'NO SETUP';
    const lv = result.levels;
    const plan = result.plan;
    return (
        <>
            <h4 className='forex-trader__h'>Previous Day High / Low rejection</h4>
            <div className='forex-trader__result-head'>
                <span className={`forex-trader__pill forex-trader__pill--${tone}`}>{pill}</span>
            </div>
            <p className='forex-trader__code-status'>{result.headline}</p>

            {lv.high !== null && lv.low !== null && lv.equilibrium !== null && (
                <dl className='forex-trader__facts'>
                    <dt>Previous Day High (PDH)</dt>
                    <dd>{fmt(lv.high)}</dd>
                    <dt>Previous Day Low (PDL)</dt>
                    <dd>{fmt(lv.low)}</dd>
                    <dt>Equilibrium (50%)</dt>
                    <dd>{fmt(lv.equilibrium)}</dd>
                    {result.levelName && result.levelPrice !== null && (
                        <>
                            <dt>Liquidity Zone in play</dt>
                            <dd>
                                {result.levelName} {fmt(result.levelPrice)}
                            </dd>
                        </>
                    )}
                    {result.footprint.count > 0 && (
                        <>
                            <dt>Institutional Footprint</dt>
                            <dd>{result.footprint.count} tall candles on the way to the level</dd>
                        </>
                    )}
                    {result.sweep && (
                        <>
                            <dt>Liquidity Sweep</dt>
                            <dd>
                                {gmt(result.sweep.time)}, price reached {fmt(result.sweep.price)}
                            </dd>
                        </>
                    )}
                    {result.rejection && (
                        <>
                            <dt>Rejection Candle</dt>
                            <dd>
                                {gmt(result.rejection.time)}, closed at {fmt(result.rejection.close)}
                            </dd>
                        </>
                    )}
                </dl>
            )}

            {plan && (
                <>
                    <h4 className='forex-trader__h'>Trade plan ({plan.side})</h4>
                    <div className='forex-trader__grid'>
                        <div className='is-entry'>
                            <span>Entry (latest closed M5 candle)</span>
                            <b>{fmt(plan.entry)}</b>
                        </div>
                        <div className='is-sl'>
                            <span>Stop Loss (beyond the sweep)</span>
                            <b>{fmt(plan.stopLoss)}</b>
                        </div>
                        <div className='is-tp'>
                            <span>Target 1 (Equilibrium)</span>
                            <b>{fmt(plan.takeProfit)}</b>
                        </div>
                        <div className='is-tp'>
                            <span>Target 2 ({plan.side === 'SELL' ? 'Previous Day Low' : 'Previous Day High'})</span>
                            <b>{fmt(plan.takeProfit2)}</b>
                        </div>
                        <div>
                            <span>Risk : Reward (to Target 1)</span>
                            <b>1 : {plan.rr.toFixed(2)}</b>
                        </div>
                    </div>
                </>
            )}

            <ul className='forex-trader__check'>
                {result.reasons.map((r, i) => (
                    <li key={i} className={result.stage === 'none' && i === result.reasons.length - 1 ? 'is-wait' : 'is-yes'}>
                        <span>{result.stage === 'none' && i === result.reasons.length - 1 ? '○' : '✔'}</span> {r}
                    </li>
                ))}
            </ul>

            <details>
                <summary>What do the names on the chart mean?</summary>
                <dl className='forex-trader__facts'>
                    <dt>Previous Day High / Low</dt>
                    <dd>The highest and lowest prices of the last full trading day. Many stop orders sit just beyond them.</dd>
                    <dt>Liquidity Zone</dt>
                    <dd>The area just beyond those levels, where those stop orders wait to be triggered.</dd>
                    <dt>Institutional Footprint</dt>
                    <dd>Two or more unusually tall candles in the same direction on the way to the level: large players moving price.</dd>
                    <dt>Liquidity Sweep</dt>
                    <dd>Price touches or pokes just beyond the level and takes the stop orders sitting there.</dd>
                    <dt>Rejection Candle</dt>
                    <dd>One M5 candle in the opposite colour, with a real body, closing below the low (or above the high) of the candle before it: the turn is confirmed. This is the entry.</dd>
                    <dt>Equilibrium</dt>
                    <dd>The 50% centre of yesterday's range. Target 1. Target 2 is the opposite level.</dd>
                </dl>
            </details>
        </>
    );
};

export default PdhPanel;
