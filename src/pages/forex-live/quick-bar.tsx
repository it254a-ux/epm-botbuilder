import { useQuotes } from './use-quotes';
import type { Side } from './trade-engine';

interface Props {
    symbol: string;
    marketName: string;
    disabled: boolean;
    pending: number;
    onFire: (side: Side) => void;
}

/** Phone chart: the sell and buy price of the market on the chart, each one a one-tap trade. */
const QuickBar = ({ symbol, marketName, disabled, pending, onFire }: Props) => {
    const q = useQuotes([symbol])[symbol];
    const pip = q?.pip ?? 5;
    const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(pip));
    return (
        <div className='fl-quick'>
            <button type='button' className='fl-quick__btn fl-quick__btn--sell' disabled={disabled} onClick={() => onFire('SELL')}>
                <small>SELL</small>
                <b>{fmt(q?.bid)}</b>
            </button>
            <span className='fl-quick__mid'>
                {marketName}
                {pending > 0 && <em>sending {pending}…</em>}
            </span>
            <button type='button' className='fl-quick__btn fl-quick__btn--buy' disabled={disabled} onClick={() => onFire('BUY')}>
                <small>BUY</small>
                <b>{fmt(q?.ask)}</b>
            </button>
        </div>
    );
};

export default QuickBar;
