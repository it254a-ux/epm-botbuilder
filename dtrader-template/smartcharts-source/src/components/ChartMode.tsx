/* eslint-disable react/react-in-jsx-scope -- tsconfig uses jsx:"react-jsx";
   React is injected by webpack's ProvidePlugin, so importing it here would be unused. */
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { TGranularity } from 'src/types';
import { localize } from 'src/translations';
import '../../sass/components/_chart-mode.scss';
import ChartTypeDialog from './ChartTypeDialog';
import DialogTrigger from './DialogTrigger';
import { ChartAreaIcon } from './Icons';

type TChartModeProps = {
    /**
     * Retained for API compatibility. The redesigned dialogs manage their own themed portal,
     * so this is no longer used for placement.
     */
    // eslint-disable-next-line react/no-unused-prop-types
    portalNodeId?: string;
    /** Optional: falls back to the chart's own setter when the host doesn't own chart type. */
    onChartType?: (chartType?: string) => void;
    /** Optional: falls back to the chart's own setter when the host doesn't own granularity. */
    onGranularity?: (granularity?: TGranularity) => void;
};

const ChartMode = ({ onChartType, onGranularity }: TChartModeProps) => {
    const { chartMode, timeperiod } = useStores();
    const { menuStore } = chartMode;
    const { display: displayInterval } = timeperiod;
    const menuOpen = menuStore.open;

    return (
        <>
            <DialogTrigger
                store={menuStore}
                className='ciq-display sc-chart-mode'
                tooltip={localize('Chart types')}
            >
                <div className={classNames('sc-chart-mode__menu', { 'sc-chart-mode__menu--active': menuOpen })}>
                    <ChartAreaIcon />
                    {displayInterval && <span className='sc-chart-mode__menu__interval'>{displayInterval}</span>}
                </div>
            </DialogTrigger>
            <ChartTypeDialog onChartType={onChartType} onGranularity={onGranularity} />
        </>
    );
};

export default observer(ChartMode);
