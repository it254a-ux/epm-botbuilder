import { useMemo, useState } from 'react';
import { useQuotes } from './use-quotes';

interface Props {
    symbols: string[];
    names: Record<string, string>;
    current: string;
    onPick: (symbol: string) => void;
}

// Show a price with the market's own number of decimals, and the last digit raised (like a trading app)
const Price = ({ value, pip, dir }: { value: number | null; pip: number; dir: 'up' | 'down' | '' }) => {
    if (value === null || !Number.isFinite(value)) return <span className='fl-quote__price'>—</span>;
    const text = value.toFixed(pip);
    const head = text.slice(0, -1);
    return (
        <span className={`fl-quote__price${dir ? ` is-${dir}` : ''}`}>
            {head}
            <b>{text.slice(-1)}</b>
        </span>
    );
};

const label = (s: string, names: Record<string, string>) => {
    const raw = s.replace(/^frx/, '');
    return names[s] || (raw.length === 6 ? `${raw.slice(0, 3)}/${raw.slice(3)}` : raw);
};

const QuotesPanel = ({ symbols, names, current, onPick }: Props) => {
    const [search, setSearch] = useState('');
    const quotes = useQuotes(symbols);
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? symbols.filter(s => `${s} ${label(s, names)}`.toLowerCase().includes(q)) : symbols;
    }, [symbols, names, search]);

    return (
        <section className='fl-quotes'>
            <input
                className='fl-quotes__search'
                type='search'
                placeholder='Search a market'
                value={search}
                onChange={e => setSearch(e.target.value)}
            />
            <ul className='fl-quotes__list'>
                {shown.map(s => {
                    const q = quotes[s];
                    const pip = q?.pip ?? 5;
                    const move = q && q.open && q.bid !== null ? ((q.bid - q.open) / q.open) * 100 : null;
                    const dir = q && q.prev !== null && q.bid !== null ? (q.bid > q.prev ? 'up' : q.bid < q.prev ? 'down' : '') : '';
                    return (
                        <li key={s}>
                            <button type='button' className={`fl-quote${s === current ? ' is-current' : ''}`} onClick={() => onPick(s)}>
                                <span className='fl-quote__left'>
                                    <em className={move === null ? '' : move >= 0 ? 'is-up' : 'is-down'}>
                                        {move === null ? '' : `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`}
                                    </em>
                                    <strong>{label(s, names)}</strong>
                                    <small>{q?.at ? new Date(q.at).toLocaleTimeString([], { hour12: false }) : ''}</small>
                                </span>
                                <span className='fl-quote__prices'>
                                    <span className='fl-quote__pair'>
                                        <Price value={q?.bid ?? null} pip={pip} dir={dir} />
                                        <Price value={q?.ask ?? null} pip={pip} dir={dir} />
                                    </span>
                                    <small>
                                        {q?.low != null ? `L: ${q.low.toFixed(pip)}` : ''}
                                        {q?.high != null ? `  H: ${q.high.toFixed(pip)}` : ''}
                                    </small>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default QuotesPanel;
