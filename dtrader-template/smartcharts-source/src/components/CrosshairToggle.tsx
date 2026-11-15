/* eslint-disable react/react-in-jsx-scope */
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import { ChartCrosshairDisabledIcon, ChartCrosshairEnabledIcon } from './Icons';
import Tooltip from './Tooltip';

const CrosshairToggle = () => {
    const { chart, crosshair } = useStores();
    const { isMobile, chartId } = chart;

    const CrosshairIcon = crosshair.isEnabled ? ChartCrosshairEnabledIcon : ChartCrosshairDisabledIcon;

    const crosshairLabel = crosshair.isEnabled ? localize('Disable Crosshair') : localize('Enable Crosshair');

    // The contract details (replay) chart sits lower in the viewport, so its tooltip stays above
    // the button. Everywhere else — the trade page included — it drops below.
    const tooltipPosition = chartId === 'replay' ? 'top' : 'bottom';

    return (
        <Tooltip
            content={crosshairLabel}
            enabled={!isMobile}
            position={tooltipPosition}
            className='sc-crosshair-toggle'
        >
            <button
                type='button'
                className='sc-navigation-widget__item'
                aria-label={crosshairLabel}
                onClick={() => crosshair.updateEnabledState(!crosshair.isEnabled)}
            >
                <CrosshairIcon />
            </button>
        </Tooltip>
    );
};

export default observer(CrosshairToggle);
