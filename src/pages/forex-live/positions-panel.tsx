import { useMemo, useState } from 'react';
import { formatMoney, summarize, type CloseFilter, type Position } from './trade-engine';

interface Props {
    positions: Position[];
    currency: string;
    /** The market on the chart, for the "this market only" switch. */
    symbol: string;
    onClose: (list: Position[]) => void;
    /** Removes the closed trades from the list. */
    onClear?: () => void;
}

const sign = (n: number | null) => (n === null || n === 0 ? '' : n > 0 ? ' is-up' : ' is-down');

const FILTERS: { key: CloseFilter; label: string; word: string }[] = [
    { key: 'all', label: 'All', word: 'all' },
    { key: 'buy', label: 'Buys', word: 'buys' },
    { key: 'sell', label: 'Sells', word: 'sells' },
    { key: 'winning', label: 'Winners', word: 'winners' },
    { key: 'losing', label: 'Losers', word: 'losers' },
];

/** Does this open trade belong to the chosen list? */
const matches = (p: Position, f: CloseFilter): boolean => {
    const pl = p.profit ?? 0;
    return f === 'all' || (f === 'buy' && p.side === 'BUY') || (f === 'sell' && p.side === 'SELL') || (f === 'winning' && pl > 0) || (f === 'losing' && pl < 0);
};

const PositionsPanel = ({ positions, currency, symbol, onClose, onClear }: Props) => {
    const [thisMarket, setThisMarket] = useState(false);
    const [showClosed, setShowClosed] = useState(true);
    // These buttons only choose WHICH open trades are listed. Nothing is closed by them.
    const [filter, setFilter] = useState<CloseFilter>('all');

    const open = useMemo(() => positions.filter(p => !p.closed), [positions]);
    const base = thisMarket ? open.filter(p => p.symbol === symbol) : open;
    const sum = useMemo(() => summarize(base), [base]);
    // the open trades on the list: only those matching the chosen filter
    const shown = useMemo(() => base.filter(p => matches(p, filter)), [base, filter]);
    const closed = useMemo(() => positions.filter(p => p.closed && (!thisMarket || p.symbol === symbol)).slice(0, 15), [positions, thisMarket, symbol]);
    const closedNet = useMemo(() => Math.round(closed.reduce((t, p) => t + (p.result ?? p.profit ?? 0), 0) * 100) / 100, [closed]);

    const count = (f: CloseFilter) => (f === 'all' ? sum.open : f === 'buy' ? sum.buys : f === 'sell' ? sum.sells : f === 'winning' ? sum.winning : sum.losing);
    const closable = shown.filter(p => p.canClose);
    const word = FILTERS.find(f => f.key === filter)?.word ?? 'all';

    return (
        <section className='forex-live__card forex-live__positions'>
            <header className='forex-live__card-head'>
                <h3>Open trades</h3>
                <label className='forex-live__switch'>
                    <input type='checkbox' checked={thisMarket} onChange={e => setThisMarket(e.target.checked)} />
                    <span>This market only</span>
                </label>
            </header>

            <div className='forex-live__summary'>
                <div>
                    <small>Open</small>
                    <b>{sum.open}</b>
                    <em>
                        ▲{sum.buys} ▼{sum.sells}
                    </em>
                </div>
                <div>
                    <small>Total stake</small>
                    <b>{sum.stake.toFixed(2)}</b>
                    <em>{currency}</em>
                </div>
                <div className={`forex-live__pl${sign(sum.profit)}`}>
                    <small>Profit / loss</small>
                    <b>{formatMoney(sum.profit)}</b>
                    <em>{currency}</em>
                </div>
            </div>

            <div className='forex-live__filters' role='group' aria-label='Show open trades'>
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        type='button'
                        className={filter === f.key ? 'is-on' : ''}
                        aria-pressed={filter === f.key}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label} <small>{count(f.key)}</small>
                    </button>
                ))}
            </div>

            {shown.length === 0 ? (
                <p className='forex-live__empty'>{open.length === 0 ? 'No open trades. Press BUY or SELL to open one.' : `No ${word} among the open trades.`}</p>
            ) : (
                <>
                    <ul className='forex-live__list'>
                        {shown.map(p => (
                            <li key={p.id} className={`forex-live__row forex-live__row--${p.side.toLowerCase()}`}>
                                <span className='forex-live__side'>{p.side === 'BUY' ? '▲ BUY' : '▼ SELL'}</span>
                                <span className='forex-live__sym'>
                                    {p.symbol.replace(/^frx/, '')}
                                    <small>
                                        {p.stake.toFixed(2)} · x{p.multiplier ?? '?'}
                                    </small>
                                </span>
                                <span className={`forex-live__rowpl${sign(p.profit)}`}>{formatMoney(p.profit)}</span>
                                <button type='button' disabled={!p.canClose} onClick={() => onClose([p])}>
                                    {p.closing ? 'Closing…' : 'Close'}
                                </button>
                            </li>
                        ))}
                    </ul>
                    <button type='button' className='forex-live__closeall' disabled={!closable.length} onClick={() => onClose(closable)}>
                        {filter === 'all' ? 'Close all' : `Close ${word}`} ({closable.length})
                    </button>
                </>
            )}

            {closed.length > 0 && (
                <>
                    <button type='button' className='forex-live__toggle' onClick={() => setShowClosed(v => !v)}>
                        <span>
                            {showClosed ? '▾' : '▸'} Closed trades ({closed.length})
                        </span>
                        <b className={`forex-live__rowpl${sign(closedNet)}`}>
                            {formatMoney(closedNet)} {currency}
                        </b>
                    </button>
                    {showClosed && onClear && (
                        <button type='button' className='forex-live__clear' onClick={onClear}>
                            Clear closed trades
                        </button>
                    )}
                    {showClosed && (
                        <ul className='forex-live__list forex-live__list--closed'>
                            {closed.map(p => {
                                const pl = p.result ?? p.profit;
                                return (
                                    <li key={p.id} className={`forex-live__row forex-live__row--${p.side.toLowerCase()}`}>
                                        <span className='forex-live__side'>{p.side === 'BUY' ? '▲ BUY' : '▼ SELL'}</span>
                                        <span className='forex-live__sym'>
                                            {p.symbol.replace(/^frx/, '')}
                                            <small>{p.stake.toFixed(2)} · x{p.multiplier ?? '?'}{p.closeReason ? ` · ${p.closeReason}` : ''}</small>
                                        </span>
                                        <span className={`forex-live__result${sign(pl)}`}>{pl === null ? '—' : pl > 0 ? 'WIN' : pl < 0 ? 'LOSS' : 'EVEN'}</span>
                                        <span className={`forex-live__rowpl${sign(pl)}`}>{formatMoney(pl)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}
        </section>
    );
};

export default PositionsPanel;
