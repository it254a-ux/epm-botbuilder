import { useEffect, useRef, useState } from 'react';
import { KINDS, STUDIES, type ChartKind, type StudyKey, type StudyState } from './indicators';
import './chart-studies.scss';

interface Props {
    state: StudyState;
    onChange: (next: StudyState) => void;
}

/** Two small buttons over the top-left of a chart: the candle style, and the indicators menu. */
const ChartStudies = ({ state, onChange }: Props) => {
    const [open, setOpen] = useState<'kind' | 'studies' | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return undefined;
        const away = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
        };
        document.addEventListener('pointerdown', away);
        return () => document.removeEventListener('pointerdown', away);
    }, [open]);

    const count = STUDIES.filter(s => state.on[s.key]).length;
    const kindLabel = KINDS.find(k => k.key === state.kind)?.label ?? 'Candles';
    const pickKind = (kind: ChartKind) => {
        onChange({ ...state, kind });
        setOpen(null);
    };
    const toggle = (key: StudyKey) => onChange({ ...state, on: { ...state.on, [key]: !state.on[key] } });

    return (
        <div className='fx-studies' ref={ref}>
            <button type='button' className={open === 'kind' ? 'is-open' : ''} onClick={() => setOpen(open === 'kind' ? null : 'kind')} title='Chart style'>
                {kindLabel} <i aria-hidden='true'>▾</i>
            </button>
            <button type='button' className={open === 'studies' ? 'is-open' : ''} onClick={() => setOpen(open === 'studies' ? null : 'studies')} title='Indicators'>
                Indicators{count > 0 && <b>{count}</b>} <i aria-hidden='true'>▾</i>
            </button>
            {open === 'kind' && (
                <div className='fx-studies__menu' role='menu'>
                    {KINDS.map(k => (
                        <button key={k.key} type='button' role='menuitemradio' aria-checked={state.kind === k.key} className={state.kind === k.key ? 'is-on' : ''} onClick={() => pickKind(k.key)}>
                            {k.label}
                        </button>
                    ))}
                </div>
            )}
            {open === 'studies' && (
                <div className='fx-studies__menu fx-studies__menu--wide' role='menu'>
                    {STUDIES.map(s => (
                        <label key={s.key} className={state.on[s.key] ? 'is-on' : ''}>
                            <input type='checkbox' checked={state.on[s.key]} onChange={() => toggle(s.key)} />
                            <span>{s.label}</span>
                            <small>{s.hint}</small>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChartStudies;
