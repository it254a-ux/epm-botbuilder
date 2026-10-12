import { useState } from 'react';
import { useDevice } from '@deriv-com/ui';
import ForexTrader from './forex-trader';
import './forex-panel.scss';

/**
 * The Forex Trader tool as the right-hand panel on the TradingView tab,
 * in the exact spot the bot Run Panel normally occupies (same position and
 * width as that drawer). Phones get a bottom sheet instead, same as the
 * Run Panel is a bottom sheet there.
 */
const ForexPanel = () => {
    const { isDesktop } = useDevice();
    const [open, setOpen] = useState(false);
    const [everOpened, setEverOpened] = useState(false);

    if (isDesktop) {
        return (
            <aside className='forex-panel forex-panel--desktop'>
                <ForexTrader variant='panel' />
            </aside>
        );
    }

    return (
        <aside className={`forex-panel forex-panel--sheet${open ? ' is-open' : ''}`}>
            <button
                type='button'
                className='forex-panel__toggle'
                onClick={() => {
                    setOpen(o => !o);
                    setEverOpened(true);
                }}
            >
                ⚡ Forex Trader <span>{open ? '▾' : '▴'}</span>
            </button>
            <div className='forex-panel__body'>{everOpened && <ForexTrader variant='panel' />}</div>
        </aside>
    );
};

export default ForexPanel;
