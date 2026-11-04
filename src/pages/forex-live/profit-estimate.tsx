import { useState } from 'react';
import { estimateProfit } from './trade-engine';
import { useQuotes } from './use-quotes';

interface Props {
    symbol: string;
    currency: string;
    stake: number;
    multiplier: number;
    /** How many trades one click opens. */
    count: number;
}

/**
 * "If price reaches this number, what would my trades make?" Type a price and it shows the estimated profit of a
 * BUY and of a SELL opened now (at the live price), for all the trades one click opens.
 */
const ProfitEstimate = ({ symbol, currency, stake, multiplier, count }: Props) => {
    const q = useQuotes([symbol])[symbol];
    const [target, setTarget] = useState('');
    const t = Number(target);
    const buy = q?.ask != null ? estimateProfit('BUY', stake, multiplier, q.ask, t) : null;
    const sell = q?.bid != null ? estimateProfit('SELL', stake, multiplier, q.bid, t) : null;
    const show = (n: number | null) => (n === null ? '–' : `${n > 0 ? '+' : ''}${(Math.round(n * count * 100) / 100).toFixed(2)}`);
    const tone = (n: number | null) => (n === null ? '' : n >= 0 ? 'is-up' : 'is-down');

    return (
        <div className='fl-estimate'>
            <label>
                <span>If price reaches</span>
                <input
                    type='number'
                    step='any'
                    inputMode='decimal'
                    placeholder={q?.bid != null ? String(q.bid) : 'price'}
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                />
            </label>
            <div className='fl-estimate__out'>
                <span className={tone(buy)}>
                    BUY {show(buy)} {currency}
                </span>
                <span className={tone(sell)}>
                    SELL {show(sell)} {currency}
                </span>
            </div>
            <small>
                Estimate for {count} trade{count === 1 ? '' : 's'} of {stake} x{multiplier} opened at the live price now (Deriv's fee not included).
            </small>
        </div>
    );
};

export default ProfitEstimate;
