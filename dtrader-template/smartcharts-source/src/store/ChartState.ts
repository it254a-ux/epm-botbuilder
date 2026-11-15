/* eslint-disable no-new */
import { action, observable, when, makeObservable, reaction } from 'mobx';
import {
    TChartControlsWidgets,
    TChartProps,
    TGetIndicatorHeightRatio,
    TGetQuotes,
    TGranularity,
    TLayout,
    TSettings,
} from 'src/types';
import { AuditDetailsForExpiredContract, ProposalOpenContract } from 'src/types/api-types';
import { isDeepEqual } from 'src/utils/object';
import { setTranslationsCdnUrl } from 'src/translations';
import { debounce } from '../utils/lodash-lite';
import MainStore from '.';
import Theme from '../../sass/_themes.scss';
import { STATE } from '../Constant';
import {
    calculateTimeUnitInterval,
    createObjectFromLocalStorage,
    saveToLocalStorage,
    getYAxisScalingParams,
} from '../utils';
import ChartStore from './ChartStore';
import { processSymbols, categorizeActiveSymbols } from '../utils/active-symbols';

// Lazy-load lz-string to reduce main bundle by ~59KB
// LZString is only needed for layout compression/decompression
type LZStringModule = typeof import('lz-string');
let _lzStringModule: LZStringModule | null = null;

const getLZString = async (): Promise<LZStringModule> => {
    if (!_lzStringModule) {
        _lzStringModule = await import(/* webpackChunkName: "lz-string" */ 'lz-string');
    }
    return _lzStringModule;
};

type TStateChangeOption = {
    indicator_type_name?: string;
    indicators_category_name?: string;
    isClosed?: boolean;
    is_favorite?: boolean;
    is_info_open?: boolean;
    is_open?: boolean;
    chart_type_name?: string;
    search_string?: string;
    symbol?: string;
    symbol_category?: string;
    time_interval_name?: string;
    drawing_tool_name?: string;
    pxthickness?: string;
    color_name?: string;
};

class ChartState {
    chartStore: ChartStore;
    getIndicatorHeightRatio?: TGetIndicatorHeightRatio;
    shouldDrawTicksFromContractInfo? = false;
    has_updated_settings = false;
    isAnimationEnabled?: boolean;
    isVerticalScrollEnabled? = true;
    mainStore: MainStore;
    margin?: number;
    granularity: TGranularity;
    chartType?: string;
    startEpoch?: number;
    endEpoch?: number;
    symbol?: string;
    heightFactor?: number;
    isConnectionOpened? = false;
    isChartReady = false;
    chartStatusListener?: (isChartReady: boolean) => boolean;
    stateChangeListener?: (state: string, option?: TStateChangeOption) => void;
    onAccumulatorBarrierTap?: () => void;
    onAccumulatorBarrierPress?: () => void;
    settings?: TSettings;
    showLastDigitStats = false;
    shouldEmphasizeLastDigit = false;
    scrollToEpoch?: number | null;
    clearChart?: () => void;
    isChartClosed = false;
    shouldMinimiseLastDigits = false;
    allowTickChartTypeOnly?: boolean;
    allowedChartTypes?: string[];
    allowedGranularities?: TGranularity[];
    restrictionMessage?: string;
    isStaticChart? = false;
    shouldFetchTradingTimes = true;
    shouldGetQuotes = true;
    allTicks: NonNullable<AuditDetailsForExpiredContract['all_ticks']> = [];
    contractInfo: ProposalOpenContract = {};
    refreshActiveSymbols?: boolean;
    hasReachedEndOfData = false;
    prevChartType?: string;
    isChartScrollingToEpoch = false;
    maxTick?: number;
    enableScroll: boolean | null = true;
    enableZoom: boolean | null = true;
    yAxisMargin = { top: 106, bottom: 64 };
    verticalPaddingFraction?: number;
    tradingTimes: string | null = null;
    activeSymbols: string | null = null;
    masterData: string | null = null;
    getQuotes?: TGetQuotes;
    chartControlsWidgets?: TChartControlsWidgets;
    enabledChartFooter?: boolean;

    get context() {
        return this.chartStore.context;
    }
    get chartTypeStore() {
        return this.mainStore.chartType;
    }
    get timeperiodStore() {
        return this.mainStore.timeperiod;
    }
    get loader() {
        return this.mainStore.loader;
    }
    get rootElement() {
        return this.chartStore.rootElement;
    }

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            granularity: observable,
            chartType: observable,
            startEpoch: observable,
            endEpoch: observable,
            symbol: observable,
            has_updated_settings: observable,
            heightFactor: observable,
            isConnectionOpened: observable,
            isChartReady: observable,
            isVerticalScrollEnabled: observable,
            chartStatusListener: observable,
            debouncedStateChange: action.bound,
            stateChangeListener: observable,
            settings: observable,
            showLastDigitStats: observable,
            shouldEmphasizeLastDigit: observable,
            allowTickChartTypeOnly: observable,
            allowedChartTypes: observable,
            allowedGranularities: observable,
            restrictionMessage: observable,
            isChartTypeAllowed: false,
            isGranularityAllowed: false,
            scrollToEpoch: observable,
            clearChart: observable,
            isChartClosed: observable,
            shouldMinimiseLastDigits: observable,
            isStaticChart: observable,
            shouldFetchTradingTimes: observable,
            shouldGetQuotes: observable,
            allTicks: observable,
            contractInfo: observable,
            refreshActiveSymbols: observable,
            shouldDrawTicksFromContractInfo: observable,
            hasReachedEndOfData: observable,
            prevChartType: observable,
            isChartScrollingToEpoch: observable,
            maxTick: observable,
            enableScroll: observable,
            enableZoom: observable,
            yAxisMargin: observable,
            verticalPaddingFraction: observable,
            updateProps: action.bound,
            setChartIsReady: action.bound,
            setChartClosed: action.bound,
        });

        this.mainStore = mainStore;
        this.chartStore = mainStore.chart;
        when(() => !!this.context, this.onContextReady);

        // Save layout before page unload (refresh)
        window.addEventListener('beforeunload', () => {
            this.saveLayout();
        });
        reaction(
            () => this.allowTickChartTypeOnly,
            allowTickChartTypeOnly => {
                if (allowTickChartTypeOnly) {
                    this.mainStore.studies.savePredictionStudies();
                    this.mainStore.studies.deletePredictionStudies();
                }
            }
        );
    }

    onContextReady = () => {
        this.granularity = this.chartStore.granularity;
    };

    /**
     * Host-driven allow-lists. An absent or empty list means "no restriction", so
     * consumers that never pass these props are unaffected.
     */
    isChartTypeAllowed(chartTypeId: string) {
        // indexOf rather than includes: the project targets ES5 with no explicit `lib`.
        return !this.allowedChartTypes?.length || this.allowedChartTypes.indexOf(chartTypeId) !== -1;
    }

    isGranularityAllowed(granularity: TGranularity) {
        return !this.allowedGranularities?.length || this.allowedGranularities.indexOf(granularity) !== -1;
    }

    updateProps({
        networkStatus,
        chartControlsWidgets,
        enabledChartFooter,
        chartStatusListener,
        shouldDrawTicksFromContractInfo,
        stateChangeListener,
        getIndicatorHeightRatio,
        chartType,
        clearChart,
        endEpoch,
        isAnimationEnabled = true,
        isConnectionOpened,
        isStaticChart,
        isVerticalScrollEnabled = true,
        granularity,
        margin = 0,
        refreshActiveSymbols,
        scrollToEpoch,
        settings,
        shouldFetchTradingTimes = true,
        shouldGetQuotes = true,
        should_zoom_out_on_yaxis,
        allTicks = [],
        contractInfo = {},
        showLastDigitStats = false,
        shouldEmphasizeLastDigit = false,
        verticalPaddingFraction,
        onAccumulatorBarrierTap,
        onAccumulatorBarrierPress,
        allowTickChartTypeOnly = false,
        allowedChartTypes,
        allowedGranularities,
        restrictionMessage,
        startEpoch,
        symbol,
        zoom,
        maxTick,
        yAxisMargin,
        enableScroll = null,
        enableZoom = null,
        anchorChartToLeft = false,
        chartData,
        isLive,
        startWithDataFitMode,
        leftMargin,
        drawingToolFloatingMenuPosition,
        translationsCdnUrl,
    }: TChartProps) {
        // First, so the initial setLanguage (ChartSettingStore.setSettings) already reads
        // the host's catalogue folder.
        setTranslationsCdnUrl(translationsCdnUrl);

        let isSymbolChanged = false;
        let isGranularityChanged = false;

        if (
            chartData?.tradingTimes &&
            typeof chartData.tradingTimes === 'object' &&
            JSON.stringify(chartData.tradingTimes) !== this.tradingTimes
        ) {
            this.mainStore.chart.tradingTimes?._calculatingTradingTime(chartData.tradingTimes);
            this.tradingTimes = JSON.stringify(chartData.tradingTimes);
        }
        if (
            chartData?.activeSymbols &&
            typeof chartData.activeSymbols === 'object' &&
            JSON.stringify(chartData.activeSymbols) !== this.activeSymbols
        ) {
            this.activeSymbols = JSON.stringify(chartData.activeSymbols);
            // Process active symbols directly
            if (this.mainStore.chart.processedSymbols && chartData?.activeSymbols) {
                this.mainStore.chart.processedSymbols = processSymbols(chartData.activeSymbols);
                this.mainStore.chart.categorizedSymbols = categorizeActiveSymbols(
                    this.mainStore.chart.processedSymbols
                );

                // Create symbol map for quick lookup
                this.mainStore.chart.symbolMap = {};
                for (const symbolObj of this.mainStore.chart.processedSymbols) {
                    this.mainStore.chart.symbolMap[symbolObj.symbol] = symbolObj;
                }
                // Point currentActiveSymbol at the freshly processed object so a
                // re-localised display_name reaches the title. The host often pushes
                // re-localised activeSymbols slightly after a language switch, and
                // without this the title would keep the old language's name.
                this.mainStore.chart.refreshCurrentActiveSymbol();
            }
        }

        if (
            chartData?.masterData &&
            Array.isArray(chartData.masterData) &&
            JSON.stringify(chartData.masterData) !== this.masterData
        ) {
            this.masterData = JSON.stringify(chartData.masterData);
            if (this.mainStore.chart.feed) {
                this.mainStore.chart.feed.updateQuotes(chartData.masterData, false);
                this.shouldGetQuotes = false;
            }
        }

        this.chartStatusListener = chartStatusListener;
        this.stateChangeListener = stateChangeListener;
        this.isAnimationEnabled = isAnimationEnabled;
        this.isConnectionOpened = isConnectionOpened;
        this.isStaticChart = isStaticChart;
        this.isVerticalScrollEnabled = isVerticalScrollEnabled;
        this.margin = margin;
        this.has_updated_settings = !isDeepEqual(this.settings?.whitespace, settings?.whitespace);
        this.settings = settings;
        this.shouldFetchTradingTimes = shouldFetchTradingTimes;
        this.shouldGetQuotes = shouldGetQuotes;
        this.allowTickChartTypeOnly = allowTickChartTypeOnly;
        this.allowedChartTypes = allowedChartTypes;
        this.allowedGranularities = allowedGranularities;
        this.restrictionMessage = restrictionMessage;
        this.allTicks = allTicks;
        this.contractInfo = contractInfo;
        this.showLastDigitStats = showLastDigitStats;
        this.getIndicatorHeightRatio = getIndicatorHeightRatio;

        const feed = this.mainStore.chart.feed;
        if (shouldDrawTicksFromContractInfo && feed && contractInfo.tick_stream) {
            this.shouldDrawTicksFromContractInfo = shouldDrawTicksFromContractInfo;
            feed.appendChartDataFromPOCResponse.call(feed, contractInfo);
        }

        if (
            networkStatus &&
            (!this.mainStore.chart.networkStatus || networkStatus.class !== this.mainStore.chart.networkStatus.class)
        ) {
            this.mainStore.chart.networkStatus = networkStatus;
        }

        if (chartControlsWidgets !== this.chartControlsWidgets) {
            this.chartControlsWidgets = chartControlsWidgets;
        }

        if (enabledChartFooter !== this.enabledChartFooter) {
            this.enabledChartFooter = enabledChartFooter;
        }

        if (symbol !== this.symbol) {
            this.symbol = symbol;
            isSymbolChanged = true;

            // When symbol changes, we need to ensure trading times are updated
            if (chartData?.tradingTimes && typeof chartData.tradingTimes === 'object') {
                this.mainStore.chart.tradingTimes?._calculatingTradingTime(chartData.tradingTimes);
                this.tradingTimes = JSON.stringify(chartData.tradingTimes);
            }

            this.mainStore.chartTitle.hidePrice();
        }

        if (chartType && chartType !== this.chartType) {
            if (chartType === 'table') this.prevChartType = this.chartTypeStore.type.id;
            this.setChartType(chartType);
        }

        if (granularity !== undefined && granularity !== this.granularity) {
            this.setChartGranularity(granularity);

            isGranularityChanged = true;
        }

        if (refreshActiveSymbols !== this.refreshActiveSymbols) {
            this.refreshActiveSymbols = refreshActiveSymbols;

            // If refreshActiveSymbols is true and we have chartData with activeSymbols, reprocess them
            if (this.refreshActiveSymbols && chartData?.activeSymbols) {
                const processedSymbols = processSymbols(chartData.activeSymbols);
                this.mainStore.chart.processedSymbols = processedSymbols;
                this.mainStore.chart.categorizedSymbols = categorizeActiveSymbols(processedSymbols);

                // Create symbol map for quick lookup
                this.mainStore.chart.symbolMap = {};
                for (const symbolObj of processedSymbols) {
                    this.mainStore.chart.symbolMap[symbolObj.symbol] = symbolObj;
                }
            }
        }

        if (clearChart !== this.clearChart) {
            this.clearChart = clearChart;
            this.cleanChart();
        }

        // This if statement should be always after setting `this.scrollToEpoch` value
        if (this.startEpoch !== startEpoch || this.endEpoch !== endEpoch) {
            this.startEpoch = startEpoch;
            this.endEpoch = endEpoch;

            if (isStaticChart && this.granularity === this.mainStore.chart.granularity) {
                // Reload the chart if it is a static chart and the granularity hasn't changed
                this.mainStore.chart.newChart();
            } else if (this.mainStore.chart.feed) {
                /* When layout is importing and range is changing as the same time we dont need to set the range,
                   the imported layout witll take care of it. */
                if (!this.scrollToEpoch && !isSymbolChanged && !isGranularityChanged) {
                    this.mainStore.chart.feed.onRangeChanged();
                }
            }
        }

        // Please always assign scrollToEpoch after startEpoch and keep this if statement exactly after above if clause
        if (!isStaticChart && scrollToEpoch !== this.scrollToEpoch) {
            this.scrollToEpoch = scrollToEpoch;
            if (this.mainStore.chart && this.mainStore.chart.feed && !isSymbolChanged && !isGranularityChanged) {
                this.setIsChartScrollingToEpoch(true);
                if (anchorChartToLeft) {
                    setTimeout(() => this.stateChange(STATE.SCROLL_TO_LEFT), 900);
                } else {
                    this.stateChange(STATE.SCROLL_TO_LEFT);
                }
            }
        }

        if (zoom) {
            if (zoom === 1) {
                this.mainStore.chartSize.zoomIn();
            } else {
                this.mainStore.chartSize.zoomOut();
            }
        }

        this.mainStore.chartSetting.setSettings(this.settings);

        if (maxTick && this.maxTick !== maxTick) {
            this.maxTick = maxTick;
        }

        if (yAxisMargin && typeof yAxisMargin === 'object') {
            this.yAxisMargin = {
                ...this.yAxisMargin,
                ...yAxisMargin,
            };
        }

        if (should_zoom_out_on_yaxis) {
            const { height_factor, yaxis_margin } = getYAxisScalingParams({
                is_contract_chart: shouldDrawTicksFromContractInfo,
                is_mobile: this.mainStore.chart.isMobile,
                ticks_length: this.mainStore.chart.feed?.quotes.length,
                yaxis_height: this.mainStore.chart.chartContainerHeight,
            });
            this.yAxisMargin = {
                ...this.yAxisMargin,
                ...yaxis_margin,
            };
            this.heightFactor = height_factor;
        }

        if (enableScroll !== null && this.enableScroll !== enableScroll) {
            this.enableScroll = enableScroll;
        }

        if (enableZoom !== null && this.enableZoom !== enableZoom) {
            this.enableZoom = enableZoom;
        }

        if (isLive !== null && isLive !== undefined && this.mainStore.chart.isLive !== isLive) {
            this.mainStore.chart.isLive = isLive;
            this.mainStore.chartAdapter.updateLiveStatus(isLive);
        }

        // Pushed on change rather than only through `newChart`, so switching
        // between a digits trade type and any other one re-styles the existing
        // current-spot label instead of waiting for a symbol or interval change.
        if (this.shouldEmphasizeLastDigit !== shouldEmphasizeLastDigit) {
            this.shouldEmphasizeLastDigit = shouldEmphasizeLastDigit;
            this.mainStore.chartAdapter.updateLastDigitEmphasis(shouldEmphasizeLastDigit);
        }

        // Pushed on change for the same reason: the trade type decides the zoom,
        // and a trade-type switch does not re-create the chart.
        if (this.verticalPaddingFraction !== verticalPaddingFraction) {
            this.verticalPaddingFraction = verticalPaddingFraction;
            this.mainStore.chartAdapter.updateVerticalPaddingFraction(verticalPaddingFraction);
        }

        // Plain assignment, no observable: the adapter only ever reads these
        // when relaying a gesture, so a stale-closure-free latest value is all
        // we need.
        this.onAccumulatorBarrierTap = onAccumulatorBarrierTap;
        this.onAccumulatorBarrierPress = onAccumulatorBarrierPress;

        if (
            startWithDataFitMode !== null &&
            startWithDataFitMode !== undefined &&
            this.mainStore.chart.startWithDataFitMode !== startWithDataFitMode
        ) {
            this.mainStore.chart.startWithDataFitMode = startWithDataFitMode;
        }

        if (this.mainStore.chart.leftMargin !== leftMargin) {
            this.mainStore.chart.leftMargin = leftMargin;
            this.mainStore.chartAdapter.updateLeftMargin(leftMargin);
        }

        // Update DrawToolsStore with drawing tool specific props
        this.mainStore.drawTools.updateProps({
            drawingToolFloatingMenuPosition,
        });
    }

    setIsChartScrollingToEpoch(isScrollingToEpoch: boolean) {
        this.isChartScrollingToEpoch = isScrollingToEpoch;
    }

    setChartClosed(isClosed: boolean) {
        this.isChartClosed = isClosed;
        this.stateChange(STATE.MARKET_STATE_CHANGE, { symbol: this.symbol, isClosed });
    }

    setChartTheme(theme: string) {
        if (this.rootElement) {
            (this.rootElement?.querySelector('.chartContainer') as HTMLElement).style.backgroundColor =
                Theme[`${theme}_chart_bg`];
        }
    }

    stateChange(tag: string, option?: TStateChangeOption) {
        if (this.stateChangeListener && typeof this.stateChangeListener === 'function') {
            this.stateChangeListener(tag, option);
        }
    }

    setChartIsReady(isChartReady: boolean) {
        if (this.isChartReady !== isChartReady) {
            this.isChartReady = isChartReady;

            if (isChartReady) {
                this.chartStore.setResizeEvent();
                this.stateChange(STATE.READY);
            }

            if (this.chartStatusListener && typeof this.chartStatusListener === 'function') {
                this.chartStatusListener(isChartReady);
            }
        }
    }

    setChartGranularity(granularity: TGranularity) {
        const isTimeUnitSecond = calculateTimeUnitInterval(granularity).timeUnit === 'second';
        const isChartTypeCandle =
            this.mainStore.chartType.isCandle ||
            (this.chartType && this.mainStore.chartType.isTypeCandle(this.chartType));

        this.mainStore.chartAdapter.setMsPerPx(undefined);

        if (this.context && isTimeUnitSecond && isChartTypeCandle) {
            this.setChartType('line'); // if granularity is zero, set the chartType to 'line'
        }
        this.granularity = granularity === null ? undefined : granularity;
    }

    setChartType(chartType: string | undefined) {
        this.chartType = chartType;
        if (this.chartType) {
            this.mainStore.chartAdapter.updateChartStyle(this.chartType);
        }
        if (this.chartTypeStore.onChartTypeChanged) {
            this.chartTypeStore.onChartTypeChanged(chartType);
        }
    }

    setShouldMinimiseLastDigit(status: boolean) {
        this.shouldMinimiseLastDigits = status;
    }

    async saveLayout() {
        if (!this.chartStore.chartId) return;
        const layoutData: TLayout = this.mainStore.view.getLayout();
        const id = this.mainStore.chart.chartId;

        const LZString = await getLZString();
        const layoutCompressedData = LZString.compress(
            JSON.stringify({
                studyItems: layoutData.studyItems,
                msPerPx: layoutData.msPerPx,
            })
        );

        saveToLocalStorage(`chart-layout-${id}`, layoutCompressedData);
    }
    // returns false if restoring layout fails
    async restoreLayout() {
        const id = this.mainStore.chart.chartId;
        const compressedLayout = createObjectFromLocalStorage(`chart-layout-${id}`);

        let layout: TLayout | null = null;
        try {
            const LZString = await getLZString();
            layout = JSON.parse(LZString.decompress(compressedLayout ?? '') || '');
        } catch (e) {
            layout = compressedLayout;
        }

        if (!layout) {
            this.clearLayout();
            return false;
        }

        this.mainStore.view.restoreLayout(layout);

        return true;
    }

    clearLayout() {
        window.flutterChart?.indicators.clearIndicators();
    }

    async saveDrawings() {
        if (!this.chartStore.chartId) return;
        const layoutData: TLayout = this.mainStore.view.getLayout();
        const id = this.mainStore.chart.chartId;

        const LZString = await getLZString();
        const layoutCompressedData = LZString.compress(
            JSON.stringify({
                studyItems: layoutData.studyItems,
                msPerPx: layoutData.msPerPx,
            })
        );

        saveToLocalStorage(`chart-layout-${id}`, layoutCompressedData);
    }

    cleanChart() {
        if (!this.clearChart || !this.isChartReady) return;

        this.mainStore.studies.deleteAllStudies();
    }

    debouncedStateChange = debounce((state: string, option: TStateChangeOption) => {
        this.stateChange(state, option);
    }, 500);
}

export default ChartState;
