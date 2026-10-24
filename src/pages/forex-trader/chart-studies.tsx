import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KINDS, STUDIES, type ChartKind, type StudyKey, type StudyState } from './indicators';
import './chart-studies.scss';

interface Props {
    state: StudyState;
    onChange: (next: StudyState) => void;
}

const Svg = ({ children }: { children: ReactNode }) => (
    <svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
        {children}
    </svg>
);
const KIND_ICONS: Record<ChartKind, ReactNode> = {
    candles: (
        <Svg>
            <path d='M7 4v3M7 14v4M17 6v2M17 15v3' />
            <rect x='5' y='7' width='4' height='7' rx='1' />
            <rect x='15' y='8' width='4' height='7' rx='1' />
        </Svg>
    ),
    hollow: (
        <Svg>
            <path d='M7 4v3M7 14v4M17 6v2M17 15v3' />
            <rect x='5' y='7' width='4' height='7' rx='1' />
            <rect x='15' y='8' width='4' height='7' rx='1' fill='currentColor' />
        </Svg>
    ),
    heikin: (
        <Svg>
            <path d='M6 5v14M12 8v10M18 4v13' />
            <path d='M4 9h2M10 11h2M16 7h2' />
        </Svg>
    ),
    bars: (
        <Svg>
            <path d='M7 4v15M4 8h3M17 6v13M17 15h3' />
        </Svg>
    ),
    line: (
        <Svg>
            <path d='M3 17l5-6 4 3 5-8 4 4' />
        </Svg>
    ),
    area: (
        <Svg>
            <path d='M3 17l5-6 4 3 5-8 4 4v8H3z' fill='currentColor' fillOpacity='0.25' />
            <path d='M3 17l5-6 4 3 5-8 4 4' />
        </Svg>
    ),
};
const FX_ICON = (
    <Svg>
        <path d='M3 15c3 0 3-8 6-8s3 10 6 10 3-6 6-6' />
        <path d='M3 20h18' opacity='0.5' />
    </Svg>
);

/**
 * The chart style and indicators buttons. They sit at the top of the drawing toolbar (same look, same fly-out
 * menus), so nothing floats over the chart and nothing hides the market name or the price.
 */
const ChartStudies = ({ state, onChange }: Props) => {
    const [open, setOpen] = useState<'kind' | 'studies' | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = () => setOpen(null);
        window.addEventListener('fx-close-menus-from-rail', close);
        return () => window.removeEventListener('fx-close-menus-from-rail', close);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        // capture phase: the toolbar stops its own pointer events from bubbling, so a normal listener would miss them
        const away = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
        };
        document.addEventListener('pointerdown', away, true);
        return () => document.removeEventListener('pointerdown', away, true);
    }, [open]);

    const show = (which: 'kind' | 'studies') => {
        window.dispatchEvent(new Event('fx-close-menus'));
        setOpen(o => (o === which ? null : which));
    };
    const count = STUDIES.filter(s => state.on[s.key]).length;
    const toggle = (key: StudyKey) => onChange({ ...state, on: { ...state.on, [key]: !state.on[key] } });
    const kindLabel = KINDS.find(k => k.key === state.kind)?.label ?? 'Candles';

    return (
        <div className='fx-studies' ref={ref}>
            <div className='fx-group'>
                <button type='button' className={`fx-btn${open === 'kind' ? ' is-on' : ''}`} data-tip={`Chart style: ${kindLabel}`} aria-label='Chart style' onClick={() => show('kind')}>
                    {KIND_ICONS[state.kind]}
                </button>
                {open === 'kind' && (
                    <div className='fx-menu' role='menu'>
                        <div className='fx-menu__title'>Chart style</div>
                        {KINDS.map(k => (
                            <button
                                key={k.key}
                                type='button'
                                role='menuitemradio'
                                aria-checked={state.kind === k.key}
                                className={`fx-item${state.kind === k.key ? ' is-on' : ''}`}
                                onClick={() => {
                                    onChange({ ...state, kind: k.key });
                                    setOpen(null);
                                }}
                            >
                                {KIND_ICONS[k.key]}
                                <span>{k.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className='fx-group'>
                <button type='button' className={`fx-btn${open === 'studies' || count > 0 ? ' is-on' : ''}`} data-tip={count ? `Indicators (${count} on)` : 'Indicators'} aria-label='Indicators' onClick={() => show('studies')}>
                    {FX_ICON}
                    {count > 0 && <b className='fx-count'>{count}</b>}
                </button>
                {open === 'studies' && (
                    <div className='fx-menu fx-menu--wide' role='menu'>
                        <div className='fx-menu__title'>Indicators</div>
                        {STUDIES.map(s => (
                            <label key={s.key} className={`fx-item fx-check${state.on[s.key] ? ' is-on' : ''}`}>
                                <input type='checkbox' checked={state.on[s.key]} onChange={() => toggle(s.key)} />
                                <span className='fx-check__box' aria-hidden='true' />
                                <span>{s.label}</span>
                                <small>{s.hint}</small>
                            </label>
                        ))}
                    </div>
                )}
            </div>
            <i className='fx-sep' aria-hidden='true' />
        </div>
    );
};

export default ChartStudies;
