/**
 * A small italic "ABR" in the top-left corner of the chart. Tapping it opens a small pop-up with the abbreviations used on the chart
 * and what each one means. It closes with a tap outside, on the button again, or with Escape.
 */
import { useEffect, useRef, useState } from 'react';

export const ABBREVIATIONS: [string, string][] = [
    ['BC', 'Buyers confirmed'],
    ['SC', 'Sellers confirmed'],
    ['BR', 'Buyers react'],
    ['SR', 'Sellers react'],
    ['SO', 'Strong sell-off'],
    ['RL', 'Strong rally'],
    ['SWL', 'Sweep of the low'],
    ['SWH', 'Sweep of the high'],
    ['RH', 'Retest held'],
    ['HH', 'Higher high'],
    ['HL', 'Higher low'],
    ['LH', 'Lower high'],
    ['LL', 'Lower low'],
    ['LS', 'Liquidity sweep'],
    ['BOS', 'Break of structure'],
    ['POC', 'Point of control'],
    ['IL', 'Internal liquidity'],
    ['MIT', 'Major inducement (trap)'],
    ['MI', 'Minor inducement'],
    ['SEA', 'Sell entry area'],
    ['BEA', 'Buy entry area'],
    ['SZ', 'Supply zone'],
    ['DZ', 'Demand zone'],
    ['MTG', 'Mitigated'],
    ['UMT', 'Unmitigated'],
    ['SSL', 'Sell side liquidity'],
    ['BSL', 'Buy side liquidity'],
    ['EB', 'Entry buy'],
    ['ES', 'Entry sell'],
    ['LSL', 'Last low'],
    ['LSH', 'Last high'],
    ['LHL', 'Last higher low'],
    ['LLH', 'Last lower high'],
    ['IL-1 ✗', 'Internal liquidity broken'],
];

const SmcAbbrButton = () => {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return undefined;
        const away = (e: Event) => {
            if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
        };
        const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('pointerdown', away);
            document.removeEventListener('keydown', key);
        };
    }, [open]);
    return (
        <div className='smc-abbr' ref={box}>
            <button type='button' className='smc-abbr__btn' onClick={() => setOpen(o => !o)} aria-expanded={open}>
                ABR
            </button>
            {open && (
                <div className='smc-abbr__pop' role='dialog' aria-label='Abbreviations'>
                    {ABBREVIATIONS.map(([a, m]) => (
                        <div key={a} className='smc-abbr__row'>
                            <b>{a}</b>
                            <span>{m}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SmcAbbrButton;
