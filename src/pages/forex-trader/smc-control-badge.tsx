/**
 * "Who is in control" marker, drawn INSIDE the chart (not in the top bar): BUYERS / SELLERS IN CONTROL with a live blinking dot,
 * small and thin, no caption under it.
 */
import type { Control } from './smc-control';

const TITLE: Record<Control['who'], string> = {
    BUYERS: 'BUYERS IN CONTROL',
    SELLERS: 'SELLERS IN CONTROL',
    MIXED: 'NO SIDE IN CONTROL YET',
};

const SmcControlBadge = ({ control }: { control: Control }) => (
    <div className={`smc-control smc-control--${control.who.toLowerCase()}`} role='status' aria-live='polite'>
        <div className='smc-control__title'>
            <span className='smc-control__dot' aria-hidden />
            <b>{TITLE[control.who]}</b>
        </div>
    </div>
);

export default SmcControlBadge;
