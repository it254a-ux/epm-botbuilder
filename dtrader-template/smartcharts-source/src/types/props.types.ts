import {
    ActiveSymbols,
    TicksStreamResponse,
    TradingTimesResponse,
    AuditDetailsForExpiredContract,
    ProposalOpenContract,
    TGetQuotesRequest,
    OHLCStreamResponse,
    TGranularity,
} from 'src/types/api-types';

import { TActiveDrawingToolItem } from 'src/store/DrawToolsStore';
import { HtmlHTMLAttributes } from 'react';
import { BinaryAPI } from 'src/binaryapi';
import { ChartTypes } from 'src/Constant';
import ChartState from 'src/store/ChartState';
import { TNotification } from 'src/store/Notifier';

declare global {
    interface Window {
        flutterChart: TFlutterChart;
        flutterChartElement: HTMLElement;
        /** Current chart theme ('light' | 'dark'), read by the Flutter engine at bootstrap so its first frame matches the host theme */
        flutterChartTheme?: string;
        _flutter: {
            loader: {
                /** New Flutter 3.x API — handles WASM + JS build selection */
                load: (config: {
                    onEntrypointLoaded?: (engineInitializer: TEngineInitializer) => void;
                    config?: Partial<TFlutterChartConfiguration>;
                    serviceWorkerSettings?: { serviceWorkerVersion: string };
                }) => Promise<void>;
                /** Old Flutter 2.x API — kept for dart2js canvaskit fallback path */
                didCreateEngineInitializer?: (engineInitializer: TEngineInitializer) => void;
            };
            buildConfig?: {
                engineRevision?: string;
                builds: Array<{
                    compileTarget: 'dart2wasm' | 'dart2js';
                    renderer: 'skwasm' | 'canvaskit' | 'html';
                    mainWasmPath?: string;
                    jsSupportRuntimePath?: string;
                    mainJsPath?: string;
                }>;
            };
            appRunner?: {
                runApp: () => void;
            };
            initState: {
                isInitialRunCompleted: boolean;
                isEngineInitialized: boolean;
                isMounted: boolean;
            };
        };
        jsInterop: JSInterop;
    }
}

export type TAppRunner = {
    runApp: () => void;
};

export type TFlutterChartConfiguration = {
    hostElement?: HTMLElement;
    renderer?: 'html' | 'canvaskit' | 'skwasm';
    assetBase?: string;
    /** Base URL for loading main.dart.wasm, main.dart.mjs, main.dart.js */
    entryPointBaseUrl?: string;
    /** Base URL for canvaskit assets; defaults to "canvaskit" relative to page root */
    canvasKitBaseUrl?: string;
};

export type TEngineInitializer = {
    initializeEngine: ({ hostElement }: TFlutterChartConfiguration) => Promise<TAppRunner>;
};

export type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType extends readonly (infer ElementType)[]
    ? ElementType
    : never;

export type TObject = {
    [key: string]: unknown;
};

export type TCustomEvent = React.MouseEvent<HTMLElement> & {
    isHandledByDialog: boolean;
    nativeEvent: {
        isHandledByDialog: boolean;
        is_item_removed: boolean;
    };
};

export type TBinaryAPIRequest = {
    passthrough?: {
        [k: string]: unknown;
    };
    req_id?: number;
    [key: string]: unknown;
};

export type TBinaryAPIResponse = {
    echo_req?: {
        [k: string]: unknown;
    };
    req_id?: number;
    msg_type: any;
    active_symbols?: ActiveSymbols;
    trading_times?: TradingTimesResponse['trading_times'];
    time?: number;
    [key: string]: unknown;
};

export type TRequestAPI = (request: TBinaryAPIRequest) => Promise<TBinaryAPIResponse>;
export type TResponseAPICallback = (response: TQuote) => void;
export type TUnsubscribeQuotes = (request?: TGetQuotesRequest, callback?: TResponseAPICallback) => void;
export type TGetQuotesResult = {
    candles?: Array<{
        open: number;
        high: number;
        low: number;
        close: number;
        epoch: number;
    }>;
    history?: {
        prices: number[];
        times: number[];
    };
};

export type TGetQuotes = (params: {
    symbol: string;
    granularity: number;
    count: number;
    start?: number;
    end?: number;
    style?: string;
}) => Promise<TGetQuotesResult>;
export type TSubscribeQuotes = (
    params: { symbol: string; granularity: TGranularity },
    callback: (quote: TQuote) => void
) => () => void;
export type TNetworkConfig = {
    class: string;
    tooltip: string;
};

export type Listener = (...args: any[]) => void;

export type TIconProps = {
    className?: string;
    ['tooltip-title']?: React.ReactElement | string;
} & HtmlHTMLAttributes<HTMLSpanElement>;

export type TBar = {
    height: number;
    cName: string;
};

export type ChartType = ArrayElement<typeof ChartTypes> & {
    active?: boolean;
    disabled?: boolean;
    /** Why the option is disabled, surfaced as a tooltip in the chart type dialog. */
    disabledReason?: string;
};

export type TLanguage = {
    key: string;
    name: string;
    icon: JSX.Element;
};

export type TSettings = {
    countdown?: boolean;
    historical?: boolean;
    lang?: string;
    language?: string;
    minimumLeftBars?: number;
    position?: string;
    enabledNavigationWidget?: boolean;
    isAutoScale?: boolean;
    isHighestLowestMarkerEnabled?: boolean;
    /** @deprecated Smooth chart movement is always enabled; this value is ignored. */
    isSmoothChartEnabled?: boolean;
    theme?: string;
    activeLanguages?: Array<string | TLanguage> | null;
    whitespace?: number;
};

export type TStateChangeListener = (
    state: string,
    option?: {
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
    }
) => void;

export type TRatio = {
    height: number;
    percent: number;
};

export type TGetIndicatorHeightRatio = (chart_height: number, indicator_count: number) => TRatio;

export type TInitialChartData = {
    masterData?: TQuote[];
    tradingTimes?: Record<string, { isOpen: boolean; openTime: string; closeTime: string }>;
    activeSymbols?: ActiveSymbols;
};

export type TBarrierUpdateProps = {
    shade: string;
    shadeColor: string | undefined;
    foregroundColor: string | null;
    color: string;
    backgroundColor?: string;
    onChange: (param: TBarrierChangeParam) => void;
    relative: boolean;
    draggable: boolean;
    lineStyle: string;
    hidePriceLines: boolean;
    high?: number | string;
    low?: number | string;
    hideBarrierLine?: boolean;
    hideOffscreenBarrier?: boolean;
    hideOffscreenLine?: boolean;
    title?: string;
    showOffscreenArrows?: boolean;
    isSingleBarrier?: boolean;
    opacityOnOverlap?: number;
    useInlineLabel?: boolean;
    key: string;
};

export type TChartProps = {
    unsubscribeQuotes: BinaryAPI['unsubscribeQuotes'];
    getQuotes?: TGetQuotes;
    subscribeQuotes?: TSubscribeQuotes;
    id?: string;
    getMarketsOrder?: (active_symbols: ActiveSymbols) => string[];
    getIndicatorHeightRatio?: TGetIndicatorHeightRatio;
    symbol?: string;
    feedCall?: { activeSymbols?: boolean; tradingTimes?: boolean };
    granularity?: TGranularity;
    chartType?: string;
    should_zoom_out_on_yaxis?: boolean;
    startEpoch?: number;
    endEpoch?: number;
    chartControlsWidgets?: TChartControlsWidgets;
    topWidgets?: () => React.ReactElement;
    bottomWidgets?: () => React.ReactElement;
    toolbarWidget?: () => React.ReactElement;
    isMobile?: boolean;
    onSettingsChange?: (newSettings: Omit<TSettings, 'activeLanguages'>) => void;
    stateChangeListener?: TStateChangeListener;
    settings?: TSettings;
    barriers?: TBarrierUpdateProps[];
    enableRouting?: boolean;
    enable?: boolean;
    shouldDrawTicksFromContractInfo?: boolean;
    isConnectionOpened?: boolean;
    onMessage?: (message: TNotification) => void;
    isAnimationEnabled?: boolean;
    isVerticalScrollEnabled?: boolean;
    showLastDigitStats?: boolean;
    /**
     * Renders the last digit of the current spot's price label larger and bolder
     * than the rest of the price.
     *
     * For digit contracts (Matches/Differs, Over/Under, Even/Odd), whose outcome
     * is decided by that digit alone. Can be toggled at any time — it does not
     * require the chart to be re-created.
     */
    shouldEmphasizeLastDigit?: boolean;
    /**
     * The chart's vertical zoom, as the share of its height given up to padding
     * above and below the data. Less padding stretches the quote range over more
     * pixels; the chart clamps it to 0.05 (most zoomed in) - 0.49.
     *
     * Sets the scale rather than fixing it: the user can still drag the quote
     * labels away from it. Changing the value re-applies it, so it can follow the
     * trade type without the chart being re-created. Omit it to let `yAxisMargin`
     * decide, as before.
     */
    verticalPaddingFraction?: number;
    scrollToEpoch?: number | null;
    clearChart?: () => void;
    shouldFetchTradingTimes?: boolean;
    shouldGetQuotes?: boolean;
    allowTickChartTypeOnly?: boolean;
    /**
     * Restricts the chart-type picker to this set of chart type ids (e.g. `['line']`).
     * Anything outside the list renders disabled with `restrictionMessage` as its tooltip.
     * Omit (or pass an empty array) for no restriction.
     */
    allowedChartTypes?: string[];
    /**
     * Restricts the time-interval picker to this set of granularities (e.g. `[0]` for 1 tick).
     * Anything outside the list renders disabled with `restrictionMessage` as its tooltip.
     * Omit (or pass an empty array) for no restriction.
     */
    allowedGranularities?: TGranularity[];
    /**
     * Tooltip shown on options disabled by `allowedChartTypes` / `allowedGranularities`.
     * Host-supplied so the copy can name the trade type, e.g.
     * `Only "Area" chart and "1 tick" interval are available for Accumulator.`
     */
    restrictionMessage?: string;
    allTicks?: NonNullable<AuditDetailsForExpiredContract>['all_ticks'];
    contractInfo?: ProposalOpenContract;
    maxTick?: number | null;
    zoom?: number;
    yAxisMargin?: { bottom: number; top: number };
    enableScroll?: boolean | null;
    enableZoom?: boolean | null;
    chartData?: TInitialChartData;
    /**
     * Base URL of SmartCharts' translation catalogues, read as
     * `<translationsCdnUrl>/translations/<lang>.json`. Pass the folder of the host's
     * environment, e.g. `https://translations.deriv.com/deriv-smartcharts/staging`.
     * Defaults to the production folder.
     */
    translationsCdnUrl?: string;
    networkStatus?: TNetworkConfig;
    refreshActiveSymbols?: ChartState['refreshActiveSymbols'];
    chartStatusListener?: ChartState['chartStatusListener'];
    enabledChartFooter?: boolean;
    anchorChartToLeft?: boolean;
    margin?: number;
    isStaticChart?: ChartState['isStaticChart'];
    enabledNavigationWidget?: boolean;
    onGranularityChange?: (granularity?: TGranularity) => void;
    onChartTypeChange?: (chartType?: string) => void;
    children?: React.ReactNode;
    historical?: boolean;
    contracts_array?: any[];
    /**
     * Accumulators barrier band. Pass `null` (or omit) when there is nothing to draw.
     *
     * The chart infers the contract state from which fields are present, so the host only
     * has to forward what it knows. See {@link TAccumulatorBarriers}.
     */
    accumulatorBarriers?: TAccumulatorBarriers | null;
    /**
     * Called when the Accumulators band is tapped.
     *
     * The cue to put your growth-rate control on screen; move the band from
     * there with `accumulatorBarriers.interaction.previewGrowthRate`.
     */
    onAccumulatorBarrierTap?: () => void;
    /**
     * Called the moment a press lands on the Accumulators band, before it is
     * known whether it will become a tap or a pan.
     *
     * How to tell your own gestures apart from the chart's. A document listener
     * in the capture phase decides what a gesture means before the chart sees
     * it at all, so `onAccumulatorBarrierTap` arrives too late to stop a
     * tap-anywhere handler acting on the same press; this does not.
     */
    onAccumulatorBarrierPress?: () => void;
    isLive?: boolean;
    startWithDataFitMode?: boolean;
    leftMargin?: number;
    drawingToolFloatingMenuPosition?: TFloatingMenuPositionOffset;
    crosshairEnabled?: boolean; // Initial crosshair state. When set, overrides localStorage and doesn't persist.
};

/**
 * The Accumulators band that tracks the current spot.
 *
 * Omitting `profit` makes it the pre-trade proposal band; supplying it makes it a
 * running contract, drawn green or red by the profit's sign with the P/L inside
 * the band.
 */
export type TAccumulatorLiveBarriers = {
    /** High barrier, as the display string the API returned. Its decimals set the label precision. */
    highBarrier: string;
    /** Low barrier, as the display string the API returned. */
    lowBarrier: string;
    /** Epoch (seconds) of the tick these barriers belong to. */
    barrierEpoch: number;
    /** Pre-formatted barrier-to-spot distance. Derived from the barriers when omitted. */
    barrierSpotDistance?: string;
    /** Quote compared against the barriers to detect a hit — what turns the band red. */
    spot: number;
    /** Epoch (seconds) of `spot`. */
    spotEpoch: number;
    /** Contract profit. Omit for a pre-trade proposal. */
    profit?: number;
    /** Currency shown next to `profit`. */
    currency?: string;
    /** Decimals `profit` is rendered with. Defaults to 2. */
    fractionalDigits?: number;
    /** Sold, but the exit tick hasn't arrived yet: the band stays, the P/L overlay goes. */
    isSold?: boolean;
};

/** The frozen Accumulators band of a contract that has just finished. */
export type TAccumulatorClosedBarriers = {
    /** High barrier at exit time, as the display string the API returned. */
    highBarrier: string;
    /** Low barrier at exit time, as the display string the API returned. */
    lowBarrier: string;
    /** Epoch (seconds) of the tick before the exit — where the band starts. */
    barrierEpoch?: number;
    /** Pre-formatted barrier-to-exit-spot distance. Derived from the barriers when omitted. */
    barrierSpotDistance?: string;
    /** Exit quote — where the band ends. */
    exitSpot: number;
    /** Epoch (seconds) of `exitSpot`. */
    exitEpoch: number;
    /** Final profit or loss, drawn inside the band. */
    profit?: number;
    /** Currency shown next to `profit`. */
    currency?: string;
    /** Decimals `profit` is rendered with. Defaults to 2. */
    fractionalDigits?: number;
    /**
     * How long to keep this band before retiring it, in milliseconds.
     *
     * Omit to keep it indefinitely — what a contract-details replay wants, since the
     * finished contract is the whole point of that chart. A trade chart passes a
     * short window so the band clears once the next contract can start.
     */
    retentionMs?: number;
};

/**
 * Everything the chart needs to draw the Accumulators barrier bands.
 *
 * They are native chart annotations, not markers — the same
 * `AccumulatorIndicator` / `AccumulatorsRecentlyClosedIndicator` the Deriv mobile
 * app uses. Both bands can be on screen together: a knocked-out contract keeps
 * its frozen band for 8 seconds while the next proposal already draws over it.
 */
export type TAccumulatorBarriers = {
    /** The band tracking the current spot — a proposal, or a running contract. */
    live?: TAccumulatorLiveBarriers | null;
    /** The frozen band of a contract that has just finished. */
    closed?: TAccumulatorClosedBarriers | null;
    /**
     * How long to hold a `live` barrier update back, in milliseconds. Defaults to 500.
     *
     * Barriers and the tick they belong to arrive on separate messages; applying them
     * immediately makes the band jump ahead of the spot. Symbols that tick every 2s
     * want a longer hold than 1s ones.
     */
    barrierDelayMs?: number;
    /**
     * Makes the `live` band interactive. Omit it (or disable it) and the band
     * is read-only, exactly as before.
     */
    interaction?: TAccumulatorBarrierInteraction | null;
};

/** One selectable rung of the Accumulators growth-rate ladder. */
export type TAccumulatorGrowthRateStep = {
    /** Growth rate as a fraction, e.g. `0.03` for 3%. */
    growthRate: number;
    /**
     * Distance between the spot and each barrier at this growth rate, in quote
     * units. This is what the band is drawn at for a previewed rate.
     */
    barrierSpotDistance: number;
    /** Pre-formatted `barrierSpotDistance` for the `±` labels beside the barriers. */
    barrierSpotDistanceDisplay?: string;
    /** Pre-formatted `growthRate`, e.g. `'3%'`. */
    growthRateDisplay?: string;
};

/**
 * Makes the Accumulators band a growth-rate control.
 *
 * The host owns every rule behind `enabled` — pre-purchase only, market open,
 * trade params unlocked — and owns the ladder. The band is a tap target: the
 * chart reports the tap and the host puts its own picker on screen, moving the
 * band from there with `previewGrowthRate`.
 */
export type TAccumulatorBarrierInteraction = {
    /**
     * The rate to show the band at, ahead of the barriers that go with it.
     *
     * Your own control moves the band; without this it would only catch up a
     * proposal round-trip later. Null or omitted hands the band back to the
     * barriers you send.
     */
    previewGrowthRate?: number | null;
    /**
     * Whether to show the one-time hint that the band can be tapped.
     *
     * A pulsing hand on the band. The chart drops it the instant the band is
     * tapped, so it never sits over the control it just opened and you do not
     * have to race it; remembering that it has been shown is yours.
     */
    showTapGuide?: boolean;
    /**
     * Copy for the tap hint's label, e.g. `'Tap to adjust'`.
     *
     * Yours to supply and to translate: the chart has no locale of its own, so
     * a string it invented would ship in English everywhere. Omit it to show
     * the pulsing hand alone.
     */
    tapGuideLabel?: string;
    /** Whether the band is interactive right now. */
    enabled: boolean;
    /** The growth rates the user may pick between. */
    steps: TAccumulatorGrowthRateStep[];
};

export type TQuote = {
    Date: string;
    Open?: number;
    High?: number;
    Low?: number;
    Close: number;
    tick?: TicksStreamResponse['tick'];
    ohlc?: OHLCStreamResponse['ohlc'];
    DT?: Date;
    prevClose?: number;
    Volume?: number;
};

export interface IPendingPromise<T, E> extends Promise<T> {
    resolve: (res: T | PromiseLike<T>) => void;
    reject: (error: E | PromiseLike<E>) => void;
    isPending: boolean;
    data: any;
}

export type TChanges = {
    [key: string]: boolean;
};

export type TSettingsItemGroup = {
    key: string;
    title: string;
    fields: TSettingsParameter[];
};

export type TOpenClose = { date: string; open: Date; close: Date };
export type TTimes = { open: Date; close: Date };

export type TTradingTimesItem = {
    feed_license?: string;
    isClosedToday: boolean;
    holidays: string[];
    closes_early: TOpenClose[];
    opens_late: TOpenClose[];
    delay_amount: number;
    times?: TTimes[];
    isOpenAllDay: boolean;
    isClosedAllDay: boolean;
    isOpened?: boolean;
};

export type TBarrierChangeParam = { high?: string; low?: string };

export type TOpenMarket = {
    category?: string;
    subcategory?: string | null;
    market?: string | null;
};

export type TRefData = {
    setPosition: ({ epoch, price }: Record<string, number | null | undefined>) => void;
    div: HTMLDivElement;
    value?: Element | null;
};

export type TChartControlsWidgets = ((props: { isMobile?: boolean }) => React.ReactElement) | null;

export type TIcon = (props: TIconProps) => JSX.Element;

export type TMessage = {
    type: string;
    payload: any;
};

export type TPaginationCallbackParams = { quotes?: TQuote[]; error?: unknown; moreAvailable?: boolean };
export type TPaginationCallback = (params: TPaginationCallbackParams) => void;

export type TIndicatorConfig = {
    id: string;
    name: string;
    title: string;
    /**
     * Which instance of this indicator type this is - 0 for the first, 1 for
     * the second, and so on. The chart appends it to the on-chart label, the
     * same way the Indicators dialog appends it in the Active list.
     */
    number: number;
};

export type TIndicatorsTree = {
    icon: TIcon;
    name: string;
    category: string;
    items: TIndicatorItem[];
    foundItems?: TActiveItem[];
};

export type TIndicatorItem = {
    description: string;
    icon: TIcon;
    isPrediction?: boolean;
    flutter_chart_id: string;
    name: string;
    short_name: string;
};

export type TActiveItem = TIndicatorItem & {
    id: string;
    config?: Record<string, any>;
    parameters: TSettingsParameter[];
    bars?: string;
    short_name_and_index: string;
    group_length: number;
};

/**
 * The Area chart's configurable appearance, resolved into the engine's `LineStyle`
 * on the Dart side. `areaLineColor` is left undefined for the "Default" swatch, which
 * keeps the engine on its theme's own area colour.
 */
export type TAreaStylePayload = {
    areaLineColor?: string;
    areaLineThickness: number;
    areaHasGradient: boolean;
};

export type TNewChartPayload = {
    granularity: number;
    isLive: boolean;
    startWithDataFitMode: boolean;
    symbol?: string;
    chartType?: string;
    theme: string;
    msPerPx?: number;
    pipSize?: number;
    isMobile: boolean;
    isSmoothChartEnabled?: boolean;
    shouldEmphasizeLastDigit?: boolean;
    verticalPaddingFraction?: number;
    areaLineColor?: string;
    areaLineThickness?: number;
    areaHasGradient?: boolean;
    yAxisMargin?: {
        top: number;
        bottom: number;
    };
};

export type TIndicatorTooltipContent = {
    name: string;
    values: string[];
};

export type TDrawingToolConfig = {
    configId: string;
};

export type TFlutterChart = {
    app: {
        getXAxisHeight: () => number;
        getYAxisWidth: () => number;
        getCurrentTickWidth: () => number;
        newChart: (payload: TNewChartPayload) => void;
        getIndicatorHoverIndex: (
            x: number,
            y: number,
            getClosestEpoch: ((epoch: number, granularity: number) => number) | undefined,
            granularity: number,
            _indicatorIndex: number | undefined
        ) => number | null;
        getTooltipContent: (epoch: number, pipSize: number) => TIndicatorTooltipContent[];
        getXFromEpoch: (epoch: number) => number;
        getYFromQuote: (quote: number) => number;
        getEpochFromX: (x: number) => number;
        getQuoteFromY: (y: number) => number;
        scale: (scale: number) => number;
        scroll: (pxShift: number) => void;
        toggleDataFitMode: (isDataFitEnabled: boolean) => void;
        toggleXScrollBlock: (isXScrollBlocked: boolean) => void;
        scrollToLastTick: () => void;
        addOrUpdateIndicator: (config: string, index?: number) => void;
    };
    config: {
        updateTheme: (theme: string) => void;
        updateChartStyle: (chartStyle: string) => void;
        updateAreaStyle: (color: string | undefined, thickness: number, hasGradient: boolean) => void;
        updateLiveStatus: (isLive: boolean) => void;
        updateLastDigitEmphasis: (shouldEmphasize: boolean) => void;
        updateVerticalPaddingFraction: (fraction?: number) => void;
        updateContracts: (markers: any[]) => void;
        updateAccumulatorBarriers: (barriers: TAccumulatorBarriers | null) => void;
        updateCrosshairVisibility: (visibility: boolean) => void;
        updateLeftMargin: (leftMargin?: number) => void;
        updateRightPadding: (rightPadding?: number) => void;
        setSymbolClosed: (isClosed: boolean) => void;
        toggleTimeIntervalVisibility: (showInterval: boolean) => void;
        setRemainingTime: (time: string) => void;
    };
    feed: {
        onNewTick: (quote: TQuote) => void;
        onNewCandle: (quote: TQuote) => void;
        onTickHistory: (quotes: TQuote[], append: boolean) => void;
    };
    indicators: {
        removeIndicator: (index: number) => void;
        clearIndicators: () => void;
    };
    drawingTool: {
        updateFloatingMenuPosition: (x: number, y: number) => void;
        startAddingNewTool: (config: string, index?: number) => void;
        cancelAddingNewTool: () => void;
        removeDrawingTool: (index: number) => void;
        clearDrawingTool: () => void;
        // eslint-disable-next-line @typescript-eslint/ban-types
        getDrawingToolsRepoItems: () => string[];
        clearDrawingToolSelect: () => void;
    };
};

export type JSInterop = {
    onChartLoad: () => void;
    onMainSeriesPaint: (currentTickPercent: number, lerpedQuote?: number | null) => void;
    onVisibleAreaChanged: (leftEpoch: number, rightEpoch: number) => void;
    onQuoteAreaChanged: (topQuote: number, bottomQuote: number) => void;
    onAccumulatorBarrierTap: () => void;
    onAccumulatorBarrierPress: () => void;
    loadHistory: (request: TLoadHistoryParams) => void;
    indicators: {
        onRemove: (index: number) => void;
        onEdit: (index: number) => void;
        onSwap: (index1: number, index2: number) => void;
    };
    drawingTool: {
        onUpdate: (index: number, config: TDrawingToolConfig) => void;
        onLoad: (drawings: []) => void;
        onToolAdded: (toolJson: string) => void;
        onRemove: (deletedToolName: string) => void;
        onStateChanged: (currentStep: number, totalSteps: number) => void;
    };
};

export type TLoadHistoryParams = {
    count: number;
    end: number;
};

/** Common shape of a `MouseEvent` and a `Touch`, so dragging works with either input. */
export type TDragPoint = Pick<MouseEvent, 'pageX' | 'pageY'>;

export type TDragEvents = {
    onDragStart?: (ev: TDragPoint) => void;
    onDrag?: (ev: TDragPoint) => void;
    onDragReleased?: (ev: TDragPoint) => void;
};

export type TLayout = {
    chartType?: string;
    timeUnit?: string | number;
    granularity?: TGranularity;
    studyItems?: TActiveItem[];
    drawTools?: TActiveDrawingToolItem[];
    msPerPx?: number;
};

export type TAllTicks = NonNullable<AuditDetailsForExpiredContract>['all_ticks'];

export type TSettingsParameterType =
    | 'colorpicker'
    | 'number'
    | 'select'
    | 'numbercolorpicker'
    | 'switch'
    | 'pattern'
    | 'numericinput'
    | 'font';
export type TIndicatorCategory = 'inputs' | 'outputs' | 'parameters';

export interface BaseIndicatorParameter {
    path?: string;
    paths?: {
        [x: string]: string;
    };
    type: TSettingsParameterType;
    title: string;
    subtitle?: string;
    category: TIndicatorCategory;
    group_key?: string;
}

export interface IndicatorParameter<T> extends BaseIndicatorParameter {
    value?: T;
    defaultValue: T;
}

export interface TColorPickerParameter extends IndicatorParameter<string> {
    type: 'colorpicker';
}

export interface TNumberParameter extends IndicatorParameter<number> {
    type: 'number';
    min?: number;
    max?: number;
    step?: number;
}

export interface TSelectParameter extends IndicatorParameter<string> {
    type: 'select';
    options: Record<string, string>;
}

export type TNumberPickerValue = {
    color: string;
    value: number;
};

export interface TNumberColorPickerParameter extends IndicatorParameter<TNumberPickerValue> {
    type: 'numbercolorpicker';
}

export interface TSwitchParameter extends IndicatorParameter<boolean> {
    type: 'switch';
}

export interface TPatternParameter extends IndicatorParameter<string> {
    type: 'pattern';
}

export interface TFontParameter extends IndicatorParameter<Record<string, string | undefined>> {
    type: 'font';
}

export interface TNumericInputParameter extends IndicatorParameter<number> {
    type: 'numericinput';
    min?: number;
    max?: number;
    step?: number;
}

export type TSettingsParameter =
    | TColorPickerParameter
    | TNumberParameter
    | TSelectParameter
    | TNumberColorPickerParameter
    | TSwitchParameter
    | TPatternParameter
    | TFontParameter
    | TNumericInputParameter;

export type TDefaultIndicatorConfig = {
    config?: Record<string, any>;
    parameters: TSettingsParameter[];
};

export type TDefaultIndicatorConfigFn = () => TDefaultIndicatorConfig;

export type TDefaultIndicatorConfigMap = Record<string, TDefaultIndicatorConfigFn>;

export type TFloatingMenuPositionOffset = {
    x: number;
    y: number;
};
