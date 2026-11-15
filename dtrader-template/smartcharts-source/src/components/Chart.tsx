import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React, { useImperativeHandle } from 'react';
import 'react-tabs/style/react-tabs.css';
import { useStores } from 'src/store';
import { TChartProps } from 'src/types';
import { safeParse } from 'src/utils';

/* css + scss */
import { getLanguage, localize } from 'src/translations';
import '../../sass/main.scss';
import { initGA, logPageView } from '../utils/ga';
import Barrier from './Barrier';
import BottomWidget from './BottomWidget';
import BottomWidgetsContainer from './BottomWidgetsContainer';
import ChartControls from './ChartControls';
import ChartFooter from './ChartFooter';
import ChartTitle from './ChartTitle';
import DrawingConfirmationToast from './DrawingConfirmationToast';
import DeletionSnackbar from './DeletionSnackbar';
import HighestLowestMarker from './HighestLowestMarker';
import IndicatorPredictionDialog from './IndicatorPredictionDialog';
import Loader from './Loader';
import NavigationWidget from './NavigationWidget';
import PaginationLoader from './PaginationLoader';
import RenderInsideChart from './RenderInsideChart';
import SettingsDialog from './SettingsDialog';
import ScrollToRecent from './ScrollToRecent';

const Chart = React.forwardRef<
    { hasPredictionIndicators(): boolean; triggerPopup(cancelCallback: () => void): void },
    TChartProps
>((props, ref) => {
    const { chart, drawTools, studies, chartSetting, chartType, state, loader, chartAdapter, timeperiod, crosshair } =
        useStores();
    const { chartId, init, destroy, isChartAvailable, chartContainerHeight, containerWidth } = chart;
    const { restoreStudies, activeItems } = studies;
    const { settingsDialog: drawToolsSettingsDialog } = drawTools;
    const { settingsDialog: chartTypeSettingsDialog, isCandle, isSpline } = chartType;
    const { updateProps, isChartClosed } = state;
    const { theme, position, isHighestLowestMarkerEnabled } = chartSetting;
    const { isActive: isLoading } = loader;

    const rootRef = React.useRef<HTMLDivElement>(null);
    const chartContainerRef = React.useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => {
        return {
            hasPredictionIndicators() {
                return localStorage.getItem('predictionIndicators') !== null;
            },
            triggerPopup(cancelCallback: () => void) {
                timeperiod.predictionIndicator.setOpen(true);
                timeperiod.predictionIndicator.setCancel(() => {
                    if (localStorage.getItem('predictionIndicators')) {
                        cancelCallback();
                        restoreStudies([
                            ...activeItems,
                            ...safeParse(localStorage.getItem('predictionIndicators') || ''),
                        ]);
                    }
                });
            },
        };
    });

    React.useEffect(() => {
        initGA();
        logPageView();

        // Set crosshair state BEFORE chart initialization
        if (props.crosshairEnabled !== undefined) {
            crosshair.setInitialEnabledState(props.crosshairEnabled);
        }

        updateProps(props);
        init(rootRef.current, props);

        return () => {
            destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
        updateProps(props);
    });

    // NOTE: do not show the loader from a `getLanguage()` effect here. It only
    // flips *inside* the translation-loaded callback that hides the loader, so a
    // show driven off it always lands after that hide and can never be balanced —
    // it wedges "Retrieving Chart Data..." on for good.
    // A language switch also has no loader to wait on: ChartSettingStore's language
    // reaction only calls ChartStore.refreshCurrentActiveSymbol() to re-localise the
    // title, which never re-inits the chart. The loader is only ever shown by mount
    // (ChartStore.init), a symbol/granularity reload (ChartStore.newChart) and a
    // template restore (ViewStore.restoreLayout) — none of which a locale change hits.

    const defaultTopWidgets = () => <ChartTitle />;

    const {
        id,
        isMobile = false,
        barriers = [],
        children,
        chartControlsWidgets,
        topWidgets,
        bottomWidgets,
        enabledChartFooter = true,
        enabledNavigationWidget = true,
        toolbarWidget = () => null,
        historical,
        contracts_array = [],
        accumulatorBarriers = null,
    } = props;

    const hasPosition = chartControlsWidgets && position && !isMobile;
    const TopWidgets = topWidgets || defaultTopWidgets;
    // if there are any markers, then increase the subholder z-index
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const ToolbarWidget = React.useCallback(toolbarWidget, [getLanguage()]);

    React.useEffect(() => {
        chartAdapter.onMount(chartContainerRef.current as HTMLDivElement);
        return () => {
            chartAdapter.onUnmount();
        };
    }, []);

    React.useEffect(() => {
        chartAdapter.updateContracts(contracts_array);
    }, [contracts_array]);

    React.useEffect(() => {
        chartAdapter.updateAccumulatorBarriers(accumulatorBarriers);
    }, [accumulatorBarriers]);

    return (
        <div
            id={id || chartId}
            className={classNames('smartcharts', `smartcharts-${theme}`, {
                'smartcharts--navigation-widget': enabledNavigationWidget,
                'smartcharts--loading': isLoading,
                'smartcharts--has-markers': children && React.Children.count(children) > 0,
                [`smartcharts-${containerWidth}`]: !isMobile,
            })}
        >
            <div
                className={classNames({
                    'smartcharts-mobile': isMobile,
                    'smartcharts-desktop': !isMobile,
                })}
            >
                <div className='cq-context' ref={rootRef}>
                    <div
                        className={classNames({
                            [`cq-chart-control-${position}`]: hasPosition,
                            'cq-chart-control-bottom': !hasPosition,
                        })}
                    >
                        <div className='ciq-chart-area'>
                            <div className={classNames('ciq-chart', { 'closed-chart': isChartClosed })}>
                                <RenderInsideChart at='subholder'>
                                    {barriers.map(({ key, ...barr }, idx) => (
                                        <Barrier
                                            key={`barrier-${idx}`} // eslint-disable-line react/no-array-index-key
                                            {...barr}
                                        />
                                    ))}
                                </RenderInsideChart>
                                <RenderInsideChart at='subholder'>
                                    {!isCandle && !isSpline && isHighestLowestMarkerEnabled && <HighestLowestMarker />}
                                </RenderInsideChart>
                                <RenderInsideChart at='subholder'>{children}</RenderInsideChart>
                                <RenderInsideChart at='subholder'>
                                    <PaginationLoader />
                                </RenderInsideChart>
                                {!loader.isActive && (
                                    <div className='cq-top-ui-widgets'>
                                        <TopWidgets />
                                    </div>
                                )}
                                <div
                                    className='chartContainer'
                                    ref={chartContainerRef}
                                    style={{
                                        height:
                                            historical && chartContainerHeight && isMobile
                                                ? chartContainerHeight - 30
                                                : chartContainerHeight,
                                    }}
                                />
                                {enabledNavigationWidget && <NavigationWidget />}
                                {ToolbarWidget && <ToolbarWidget />}
                                {!isChartAvailable && (
                                    <div className='cq-chart-unavailable'>
                                        {localize('Chart data is not available for this symbol.')}
                                    </div>
                                )}
                                <div className='cq-inchart-subholder' />
                                <BottomWidgetsContainer>
                                    <BottomWidget bottomWidgets={bottomWidgets} />
                                </BottomWidgetsContainer>
                            </div>
                            {chartControlsWidgets !== null && !enabledChartFooter && (
                                <ChartControls widgets={chartControlsWidgets} />
                            )}
                            <ScrollToRecent />
                            {enabledChartFooter && <ChartFooter />}
                            <Loader />
                        </div>
                    </div>
                </div>
                <SettingsDialog store={drawToolsSettingsDialog} />
                <SettingsDialog store={chartTypeSettingsDialog} />
                <IndicatorPredictionDialog />
                <DrawingConfirmationToast />
                <DeletionSnackbar />
                <div id='smartcharts_modal' className='ciq-modal' />
            </div>
        </div>
    );
});

export default observer(Chart);
