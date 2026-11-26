/**
 * "Who is in control" marker, drawn INSIDE the chart (not in the top bar): BUYERS / SELLERS IN CONTROL with a live blinking dot,
 * the line the other side must close beyond to take control, and a warning when the side in control is being rejected.
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
        {control.flip && <div className='smc-control__note'>{control.flip.note}</div>}
        {control.weakening && <div className='smc-control__warn'>{control.weakening}</div>}
    </div>
);

export default SmcControlBadge;
