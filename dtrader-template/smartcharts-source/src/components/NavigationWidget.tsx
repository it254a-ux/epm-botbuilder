/* eslint-disable react/react-in-jsx-scope */
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import CrosshairToggle from './CrosshairToggle';
import Tooltip from './Tooltip';
import '../../sass/components/_navigation-widget.scss';

import { ChartMinusIcon, ChartPlusIcon, ScaleIcon } from './Icons';

const NavigationWidget = () => {
    const { chart, chartSize, navigationWidget, chartSetting, chartAdapter } = useStores();
    const { context, startWithDataFitMode, isMobile } = chart;
    const { zoomIn, zoomOut } = chartSize;
    const { historical } = chartSetting;
    const { onMouseEnter, onMouseLeave } = navigationWidget;
    const { isDataFitModeEnabled, toggleDataFitMode } = chartAdapter;

    return context ? (
        <div
            className={classNames('sc-navigation-widget', {
                'sc-navigation-widget--indent': historical,
            })}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className='sc-navigation-widget__buttons'>
                <Tooltip
                    content={localize('Scale to fit data')}
                    enabled={!isMobile && startWithDataFitMode && !isDataFitModeEnabled}
                    position='top'
                    className={classNames('sc-scale-toggle', {
                        'sc-scale-toggle--hidden': !startWithDataFitMode,
                    })}
                >
                    <button
                        type='button'
                        className={classNames('sc-navigation-widget__item', 'sc-navigation-widget__item--scale', {
                            'sc-navigation-widget__item--hidden': !startWithDataFitMode,
                            'sc-navigation-widget__item--disabled': isDataFitModeEnabled,
                        })}
                        aria-label={localize('Scale to fit data')}
                        disabled={isDataFitModeEnabled}
                        onClick={toggleDataFitMode}
                    >
                        <ScaleIcon />
                    </button>
                </Tooltip>
                <button
                    type='button'
                    className='sc-navigation-widget__item'
                    aria-label={localize('Zoom out')}
                    onClick={zoomOut}
                >
                    <ChartMinusIcon />
                </button>
                <CrosshairToggle />
                <button
                    type='button'
                    className='sc-navigation-widget__item'
                    aria-label={localize('Zoom in')}
                    onClick={zoomIn}
                >
                    <ChartPlusIcon />
                </button>
            </div>
        </div>
    ) : null;
};

export default observer(NavigationWidget);
