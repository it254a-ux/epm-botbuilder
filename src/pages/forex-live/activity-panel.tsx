import { useEffect, useState } from 'react';
import { formatMoney, type Position } from './trade-engine';
import type { LogEntry } from './use-forex-live';

interface Props {
    positions: Position[];
    log: LogEntry[];
    currency: string;
    /** When the last live message arrived (ms), 0 if none yet. */
    streamAt: number;
    /** Current time, only to let tests control it. */
    now?: () => number;
}

const sign = (n: number | null) => (n === null || n === 0 ? '' : n > 0 ? ' is-up' : ' is-down');

/**
 * The Activity card: a live line for every open trade that moves by itself as Deriv streams its price, a badge that
 * shows whether the stream is alive, and below them what has happened (opened, closed and why, refused).
 */
const ActivityPanel = ({ positions, log, currency, streamAt, now = Date.now }: Props) => {
    const [, tick] = useState(0);
    useEffect(() => {
        const t = window.setInterval(() => tick(n => n + 1), 500);
        return () => window.clearInterval(t);
    }, []);

    const open = positions.filter(p => !p.closed);
    const ago = streamAt ? Math.max(0, (now() - streamAt) / 1000) : null;
    // with trades open and no message for a while, the badge says so instead of pretending
    const quiet = open.length > 0 && (ago === null || ago > 8);
    const badge = quiet ? 'syncing…' : open.length ? `LIVE · ${ago === null ? '0.0' : ago.toFixed(1)}s` : 'LIVE';

    return (
        <section className='forex-live__card forex-live__log' aria-live='polite'>
            <header className='forex-live__card-head'>
                <h3>Activity</h3>
                <span className={`forex-live__stream${quiet ? ' is-quiet' : ''}`} title='Trades update here as Deriv streams them'>
                    ● {badge}
                </span>
            </header>
            {open.length > 0 && (
                <ul className='forex-live__livelist' aria-label='Open trades, live'>
                    {open.map(p => (
                        <li key={p.id}>
                            <span className={`forex-live__livedot${p.side === 'BUY' ? ' is-buy' : ' is-sell'}`}>{p.side === 'BUY' ? '▲' : '▼'}</span>
                            <span className='forex-live__livesym'>{p.symbol.replace(/^frx/, '')}</span>
                            <b className={`forex-live__rowpl${sign(p.profit)}`}>{p.closing ? 'closing…' : `${formatMoney(p.profit)} ${currency}`}</b>
                        </li>
                    ))}
                </ul>
            )}
            {log.length === 0 && open.length === 0 && <p className='forex-live__hint'>Trades you open and close show up here as they happen.</p>}
            {log.length > 0 && (
                <ul className='forex-live__events'>
                    {log.slice(0, 8).map(l => (
                        <li key={l.id} className={`is-${l.kind}`}>
                            {l.text}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default ActivityPanel;
