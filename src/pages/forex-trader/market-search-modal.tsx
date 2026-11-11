import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MarketSymbol } from './market-picker';
import './market-search-modal.scss';

interface Props {
    symbols: MarketSymbol[];
    value: string;
    onPick: (symbol: string) => void;
    onClose: () => void;
}

/** XAUUSD from frxXAUUSD, BTCUSD from cryBTCUSD; the Deriv codes (R_100, 1HZ10V…) stay as they are. */
export const shortCode = (symbol: string) => symbol.replace(/^(frx|cry)/, '');

const CHIP_ORDER = ['forex', 'commodities', 'indices', 'cryptocurrency', 'synthetic_index'];
const PRETTY: Record<string, string> = {
    forex: 'Forex',
    commodities: 'Commodities',
    indices: 'Indices',
    cryptocurrency: 'Crypto',
    synthetic_index: 'Synthetic indices',
};
/** Forex, Crypto, Synthetic indices… instead of the raw codes the server sends. */
const pretty = (id: string, given?: string) =>
    PRETTY[id] ?? given ?? id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

const Mark = ({ text, q }: { text: string; q: string }) => {
    const at = q ? text.toLowerCase().indexOf(q) : -1;
    if (at < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, at)}
            <mark>{text.slice(at, at + q.length)}</mark>
            {text.slice(at + q.length)}
        </>
    );
};

/** TradingView-style symbol search: big pop-up, category chips, one row per market. */
const MarketSearchModal = ({ symbols, value, onPick, onClose }: Props) => {
    const [query, setQuery] = useState('');
    const [chip, setChip] = useState('all');
    const [cursor, setCursor] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const q = query.trim().toLowerCase();

    const chips = useMemo(() => {
        const seen = new Map<string, string>();
        symbols.forEach(s => {
            if (s.market && !seen.has(s.market)) seen.set(s.market, pretty(s.market, s.market_display_name));
        });
        return Array.from(seen.entries()).sort((a, b) => {
            const ia = CHIP_ORDER.indexOf(a[0]);
            const ib = CHIP_ORDER.indexOf(b[0]);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
    }, [symbols]);

    const rows = useMemo(() => {
        const rank = (s: MarketSymbol) => {
            const code = shortCode(s.underlying_symbol).toLowerCase();
            const name = s.underlying_symbol_name.toLowerCase();
            if (!q) return 3;
            if (code === q) return 0;
            if (code.startsWith(q)) return 1;
            if (name.startsWith(q)) return 1;
            if (code.includes(q) || name.includes(q)) return 2;
            if ((s.submarket_display_name ?? '').toLowerCase().includes(q)) return 4;
            return -1;
        };
        return symbols
            .filter(s => chip === 'all' || s.market === chip)
            .map(s => ({ s, r: rank(s) }))
            .filter(x => x.r >= 0)
            .sort((a, b) => {
                const ga = CHIP_ORDER.indexOf(a.s.market);
                const gb = CHIP_ORDER.indexOf(b.s.market);
                return (
                    a.r - b.r ||
                    (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb) ||
                    a.s.underlying_symbol_name.localeCompare(b.s.underlying_symbol_name)
                );
            })
            .map(x => x.s)
            .slice(0, 300);
    }, [symbols, q, chip]);

    useEffect(() => setCursor(0), [q, chip]);
    useEffect(() => {
        listRef.current?.querySelector('.msm__row.is-cursor')?.scrollIntoView({ block: 'nearest' });
    }, [cursor]);

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor(c => Math.min(c + 1, rows.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor(c => Math.max(c - 1, 0));
        } else if (e.key === 'Enter' && rows[cursor]) onPick(rows[cursor].underlying_symbol);
    };

    return createPortal(
        <div className='msm' role='dialog' aria-modal='true' aria-label='Symbol search' onKeyDown={onKey}>
            <div className='msm__backdrop' onMouseDown={onClose} />
            <div className='msm__box'>
                <div className='msm__head'>
                    <svg
                        viewBox='0 0 24 24'
                        width='22'
                        height='22'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='1.7'
                        strokeLinecap='round'
                        aria-hidden='true'
                    >
                        <circle cx='10.5' cy='10.5' r='6.5' />
                        <path d='M15.5 15.5l5 5' />
                    </svg>
                    <input
                        autoFocus
                        className='msm__input'
                        placeholder='Search'
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {query && (
                        <button type='button' className='msm__clear' aria-label='Clear' onClick={() => setQuery('')}>
                            <svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>
                                <circle cx='12' cy='12' r='10' fill='currentColor' />
                                <path
                                    d='M8.5 8.5l7 7M15.5 8.5l-7 7'
                                    stroke='#151a24'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                />
                            </svg>
                        </button>
                    )}
                    <button type='button' className='msm__x' aria-label='Close' onClick={onClose}>
                        Esc
                    </button>
                </div>
                <div className='msm__chips'>
                    <button type='button' className={chip === 'all' ? 'is-on' : ''} onClick={() => setChip('all')}>
                        All
                    </button>
                    {chips.map(([id, name]) => (
                        <button
                            key={id}
                            type='button'
                            className={chip === id ? 'is-on' : ''}
                            onClick={() => setChip(id)}
                        >
                            {name}
                        </button>
                    ))}
                </div>
                <div className='msm__list' ref={listRef}>
                    {symbols.length === 0 && <div className='msm__empty'>Loading markets…</div>}
                    {symbols.length > 0 && rows.length === 0 && (
                        <div className='msm__empty'>No market matches “{query}”.</div>
                    )}
                    {rows.map((s, i) => (
                        <button
                            key={s.underlying_symbol}
                            type='button'
                            className={`msm__row${i === cursor ? ' is-cursor' : ''}${s.underlying_symbol === value ? ' is-current' : ''}`}
                            onMouseMove={() => setCursor(i)}
                            onClick={() => onPick(s.underlying_symbol)}
                        >
                            <span className='msm__code'>
                                <Mark text={shortCode(s.underlying_symbol)} q={q} />
                            </span>
                            <span className='msm__desc'>
                                <Mark text={s.underlying_symbol_name} q={q} />
                                {s.submarket_display_name && <em>{s.submarket_display_name}</em>}
                                {s.exchange_is_open === 0 && <em className='is-closed'>closed</em>}
                            </span>
                            <span className='msm__src'>
                                {pretty(s.market, s.market_display_name)}
                                <b>Deriv</b>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default MarketSearchModal;
