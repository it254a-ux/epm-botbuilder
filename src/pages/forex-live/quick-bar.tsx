import { useEffect, useState } from 'react';
import { useQuotes } from './use-quotes';
import { formatMoney, type Side } from './trade-engine';

interface Props {
    symbol: string;
    marketName: string;
    disabled: boolean;
    pending: number;
    onFire: (side: Side) => void;
    /** All the trades that are open right now (every market), with their live total profit. */
    open?: { count: number; profit: number; currency: string };
    /** When Deriv last sent anything about the open trades (ms), to show whether the live stream is alive. */
    streamAt?: number;
    onOpenTrades?: () => void;
}

/** "live" while Deriv keeps sending, otherwise how long it has been quiet. */
const Pulse = ({ at }: { at: number }) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    const quiet = at ? Math.floor((now - at) / 1000) : null;
    const ok = quiet !== null && quiet < 6;
    return <i className={`fl-quick__pulse${ok ? ' is-live' : ''}`}>{ok ? 'live' : quiet === null ? 'waiting' : `quiet ${quiet}s`}</i>;
};

/** Phone chart: the sell and buy price of the market on the chart, each one a one-tap trade. */
const QuickBar = ({ symbol, marketName, disabled, pending, onFire, open, streamAt, onOpenTrades }: Props) => {
    const q = useQuotes([symbol])[symbol];
    const pip = q?.pip ?? 5;
    const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(pip));
    return (
        <>
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
        {open && open.count > 0 && (
            <button type='button' className='fl-quick__open' onClick={onOpenTrades}>
                <span>{open.count} open</span>
                <b className={open.profit > 0 ? 'is-up' : open.profit < 0 ? 'is-down' : ''}>
                    {formatMoney(open.profit)} {open.currency}
                </b>
                <Pulse at={streamAt ?? 0} />
            </button>
        )}
        </>
    );
};

export default QuickBar;
