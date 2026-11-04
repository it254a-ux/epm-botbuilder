export interface GroupRow {
    uid: number;
    side: 'BUY' | 'SELL';
    open: number;
    total: number;
    takeProfit: number | null;
    stopLoss: number | null;
    active: boolean;
}

interface Props {
    rows: GroupRow[];
    currency: string;
    onChange: (uid: number, patch: { takeProfit?: number | null; stopLoss?: number | null; active?: boolean }) => void;
    onCloseAll: (uid: number) => void;
}

const parse = (v: string): number | null => (v.trim() && Number(v) > 0 ? Number(v) : null);

/**
 * The trades opened together (one click with a total take profit / stop loss, or a Price Guard touch).
 * Their total take profit and stop loss can be changed, switched off and on again, or the whole group closed, while they are open.
 */
const GroupsPanel = ({ rows, currency, onChange, onCloseAll }: Props) => {
    if (!rows.length) return null;
    return (
        <section className='forex-live__card fl-groups'>
            <header className='forex-live__card-head'>
                <h3>Trade groups</h3>
            </header>
            {rows.map(r => (
                <div key={r.uid} className={`fl-groups__row${r.active ? '' : ' is-off'}`}>
                    <div className='fl-groups__top'>
                        <b className={r.side === 'BUY' ? 'is-buy' : 'is-sell'}>
                            {r.side} ×{r.open}
                        </b>
                        <span className={r.total >= 0 ? 'is-up' : 'is-down'}>
                            {r.total > 0 ? '+' : ''}
                            {r.total.toFixed(2)} {currency}
                        </span>
                        <label className='fl-groups__switch'>
                            <input type='checkbox' checked={r.active} onChange={e => onChange(r.uid, { active: e.target.checked })} />
                            <span>{r.active ? 'Watching' : 'Off'}</span>
                        </label>
                    </div>
                    <div className='fl-groups__edit'>
                        <label>
                            Take profit
                            <input
                                key={`tp-${r.uid}-${r.takeProfit ?? ''}`}
                                type='number'
                                min='0'
                                step='any'
                                inputMode='decimal'
                                placeholder='none'
                                defaultValue={r.takeProfit ?? ''}
                                onBlur={e => onChange(r.uid, { takeProfit: parse(e.target.value) })}
                            />
                        </label>
                        <label>
                            Stop loss
                            <input
                                key={`sl-${r.uid}-${r.stopLoss ?? ''}`}
                                type='number'
                                min='0'
                                step='any'
                                inputMode='decimal'
                                placeholder='none'
                                defaultValue={r.stopLoss ?? ''}
                                onBlur={e => onChange(r.uid, { stopLoss: parse(e.target.value) })}
                            />
                        </label>
                        <button type='button' onClick={() => onCloseAll(r.uid)}>
                            Close all
                        </button>
                    </div>
                </div>
            ))}
        </section>
    );
};

export default GroupsPanel;
