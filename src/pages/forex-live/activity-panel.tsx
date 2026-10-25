import { formatMoney, type Position } from './trade-engine';
import type { LogEntry } from './use-forex-live';

interface Props {
    positions: Position[];
    log: LogEntry[];
    currency: string;
}

const sign = (n: number | null) => (n === null || n === 0 ? '' : n > 0 ? ' is-up' : ' is-down');

/**
 * The Activity card: a line for every open trade that moves by itself as Deriv streams its price, and below
 * it what has happened (opened, closed and why, refused).
 */
const ActivityPanel = ({ positions, log, currency }: Props) => {
    const open = positions.filter(p => !p.closed);

    return (
        <section className='forex-live__card forex-live__log' aria-live='polite'>
            <header className='forex-live__card-head'>
                <h3>Activity</h3>
            </header>
            {open.length > 0 && (
                <ul className='forex-live__livelist' aria-label='Open trades'>
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
