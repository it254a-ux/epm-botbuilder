import { localize } from 'src/translations';
import {
    // DrawToolsChannelIcon,
    // DrawToolsContinuousIcon,
    // DrawToolsFibonaccifanIcon,
    DrawToolsHorizontalIcon,
    DrawToolsLineIcon,
    // DrawToolsRayIcon,
    // DrawToolsRectangleIcon,
    // DrawToolsTrendIcon,
    DrawToolsVerticalIcon,
    FlagIcons,
    // Chart Types
    TypeAreaIcon,
    TypeCandleIcon,
    TypeHollowIcon,
    TypeOhlcIcon,
} from './components/Icons';
// Indicator icons imported from separate file for better tree-shaking
import {
    IndicatorAdxIcon,
    IndicatorAlligatorIcon,
    IndicatorAroonIcon,
    IndicatorAveragesIcon,
    IndicatorAwesomeOscillatorIcon,
    IndicatorBollingerIcon,
    IndicatorCatAveragesIcon,
    IndicatorCatMomentumIcon,
    IndicatorCatOtherIcon,
    IndicatorCatTrendLightIcon,
    IndicatorCatVolatilityIcon,
    IndicatorCommodityChannelIndexIcon,
    IndicatorDonchianIcon,
    IndicatorDTrendedIcon,
    IndicatorEnvelopeIcon,
    IndicatorFractalChaosIcon,
    // IndicatorGatorIcon,
    IndicatorIchimokuIcon,
    IndicatorMacdIcon,
    IndicatorParabolicIcon,
    IndicatorRainbowIcon,
    IndicatorRateChangeIcon,
    IndicatorRSIIcon,
    IndicatorStochasticMomentumIcon,
    IndicatorStochasticOscillatorIcon,
    IndicatorWilliamPercentIcon,
    IndicatorZigZagIcon,
} from './components/IndicatorIcons';
import {
    TGranularity,
    TIcon,
    TIndicatorsTree,
    TActiveItem,
    TDefaultIndicatorConfigMap,
    TDefaultIndicatorConfigFn,
} from './types';
import { clone } from './utils';

type TDrawTools = {
    [key: string]: {
        id: string;
        text: string;
        icon: TIcon;
        configType?: string;
    };
};
// TODO: Add back the drawing tools when their implementations are done.
export const getDrawTools: () => TDrawTools = () => ({
    // channel: { id: 'channel', text: localize('Channel {{num}}'), icon: DrawToolsChannelIcon },
    // continuous: { id: 'continuous', text: localize('Continuous {{num}}'), icon: DrawToolsContinuousIcon },
    // fibfan: { id: 'fibfan', text: localize('Fib Fan {{num}}'), icon: FibfanDrawingToolConfig },
    // Order matches the "All drawings" list in the design.
    horizontal: { id: 'horizontal', text: localize('Horizontal line {{num}}'), icon: DrawToolsHorizontalIcon },
    vertical: { id: 'vertical', text: localize('Vertical line {{num}}'), icon: DrawToolsVerticalIcon },
    line: { id: 'line', text: localize('Trend line {{num}}'), icon: DrawToolsLineIcon },
    // ray: { id: 'ray', text: localize('Ray {{num}}'), icon: DrawToolsRayIcon },
    // continuous: { id: 'continuous', text: localize('Continuous {{num}}'), icon: DrawToolsRayIcon },
    // rectangle: { id: 'rectangle', text: localize('Rectangle {{num}}'), icon: DrawToolsRectangleIcon },
    // trend: { id: 'trend', text: localize('Trend {{num}}'), icon: DrawToolsTrendIcon },
});

export const getTooltipLabels = (key: string, activeItem?: TActiveItem) => {
    const getBars = () => `${activeItem?.bars ? `(${activeItem.bars})` : ''}`.toUpperCase();

    const labels = {
        AwesomeOscillator: {
            labels: ['AWESOME_HIST'],
        },
        dpo: {
            labels: [`DETRENDED ${getBars()}`],
        },
        gator: {
            labels: [`GATOR ${getBars()}_HIST1`, `GATOR ${getBars()}_HIST2`],
        },
        macd: {
            labels: [`MACD MACD ${getBars()}`, `SIGNAL MACD ${getBars()}`, `MACD ${getBars()}_HIST`],
        },
        ROC: {
            labels: [`PRICE ROC ${getBars()}`],
        },
        RSI: {
            labels: [`RSI ${getBars()}`],
        },
        StochasticOscillator: {
            labels: [`%K STOCHASTICS ${getBars()}`, `%D STOCHASTICS ${getBars()}`],
        },
        SMI: {
            labels: [`%K STCH MTM ${getBars()}`, `%D STCH MTM ${getBars()}`],
        },
        WilliamsR: {
            labels: [`Williams %R ${getBars()}`],
        },
        Aroon: {
            labels: [`AROON UP ${getBars()}`, `AROON DOWN ${getBars()}`],
        },
        adx: {
            labels: [`+DI ADX ${getBars()}`, `-DI ADX ${getBars()}`, `ADX ${getBars()}`, `ADX ${getBars()}_HIST`],
        },
        commodity_channel_index: {
            labels: [`CCI ${getBars()}`],
        },
        ichimoku: {
            labels: [
                `CONVERSION LINE ICHIMOKU CLOUDS ${getBars()}`,
                `BASE LINE ICHIMOKU CLOUDS ${getBars()}`,
                `LEADING SPAN A ICHIMOKU CLOUDS ${getBars()}`,
                `LEADING SPAN B ICHIMOKU CLOUDS ${getBars()}`,
                `LAGGING SPAN ICHIMOKU CLOUDS ${getBars()}`,
            ],
        },
        ParabolicSAR: {
            labels: [`PSAR ${getBars()}`],
        },
        bollinger_bands: {
            labels: [
                `BOLLINGER BANDS TOP ${getBars()}`,
                `BOLLINGER BANDS MEDIAN ${getBars()}`,
                `BOLLINGER BANDS BOTTOM ${getBars()}`,
            ],
        },
        donchian_channel: {
            labels: [
                `DONCHIAN HIGH DONCHIAN CHANNEL ${getBars()}`,
                `DONCHIAN MEDIAN DONCHIAN CHANNEL ${getBars()}`,
                `DONCHIAN LOW DONCHIAN CHANNEL ${getBars()}`,
            ],
        },
        moving_average: {
            labels: [`MA ${getBars()}`],
        },
        moving_envelope_average: {
            labels: [`MA ENV TOP ${getBars()}`, `MA ENV MEDIAN ${getBars()}`, `MA ENV BOTTOM ${getBars()}`],
        },
        rainbow: {
            labels: Array.from(Array(10), (_, index) => index + 1).map(index => `SMA${index} RAINBOW MA ${getBars()}`),
        },
        alligator: {
            labels: [`JAW ALLIGATOR ${getBars()}`, `TEETH ALLIGATOR ${getBars()}`, `LIPS ALLIGATOR ${getBars()}`],
        },
        fcb: {
            labels: [`FRACTAL HIGH FRACTAL CHAOS BANDS ${getBars()}`, `FRACTAL LOW FRACTAL CHAOS BANDS ${getBars()}`],
        },
    };

    return labels[key as keyof typeof labels];
};

export const getIndicatorsTree = (): TIndicatorsTree[] => [
    {
        category: 'momentum',
        name: localize('Momentum'),
        icon: IndicatorCatMomentumIcon,
        items: [
            {
                flutter_chart_id: 'AwesomeOscillator',
                name: localize('Awesome Oscillator'),
                short_name: localize('Awesome'),
                description: localize(
                    "The Awesome Oscillator is an indicator used to measure market momentum. AO calculates the difference of a 34 Period and 5 Period Simple Moving Averages. The Simple Moving Averages that are used are not calculated using closing price but rather each bar's midpoints. AO is generally used to affirm trends or to anticipate possible reversals."
                ),
                icon: IndicatorAwesomeOscillatorIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'dpo',
                name: localize('Detrended Price Oscillator'),
                short_name: localize('Detrended'),
                description: localize(
                    'The Detrended Price Oscillator (DPO) helps to identify price cycles without the influence of short- and long-term trends. The DPO compares a simple moving average to a historical pricenear the middle of a specified period. It also shows the peaks and drops over that particular period, making it easier to predict buy points.'
                ),
                icon: IndicatorDTrendedIcon,
            },
            // {
            //     flutter_chart_id: 'gator',
            //     name: localize('Gator Oscillator'),
            //     short_name: localize('Gator'),
            //     description: localize(
            //         'The Gator Oscillator helps to detect trend changes in the market price. Based on the Alligator indicator, the Gator plots 2 histograms on either side of the zero line. The sleeping phase (absence of a trend) is when the bars on both sides are red. The awakening phase (formation of a trend) is when there are red and green bars on both sides. When there are green bars on both sides, it indicates the eating phase (trend strengthening). A solitary red bar appearing after the eating phase indicates the beginning of the sated phase (trend approaching its end).'
            //     ),
            //     icon: IndicatorGatorIcon,
            //     isPrediction: true,
            // },
            {
                flutter_chart_id: 'macd',
                name: localize('MACD'),
                short_name: localize('MACD'),
                description: localize(
                    "MACD is a trading indicator used in technical analysis of stock prices. It is supposed to reveal changes in the strength, direction, momentum, and duration of a trend in a stock's price."
                ),
                icon: IndicatorMacdIcon,
            },
            {
                flutter_chart_id: 'ROC',
                name: localize('Price Rate of Change'),
                short_name: localize('Price ROC'),
                description: localize(
                    'The Price Rate-of-Change (ROC) indicator displays the difference between the current price and the price x-time periods ago. The difference can be displayed in either points or as a percentage.'
                ),
                icon: IndicatorRateChangeIcon,
            },
            {
                flutter_chart_id: 'RSI',
                name: localize('Relative Strength Index (RSI)'),
                short_name: localize('RSI'),
                description: localize(
                    'The Relative Strength Index (RSI) was published by J. Welles Wilder. The current price is normalized as a percentage between 0 and 100. The name of this oscillator is misleading because it does not compare the instrument relative to another instrument or set of instruments, but rather represents the current price relative to other recent prices within the selected lookback window length.'
                ),
                icon: IndicatorRSIIcon,
            },
            {
                flutter_chart_id: 'StochasticOscillator',
                name: localize('Stochastic Oscillator'),
                short_name: localize('Stochastic'),
                description: localize(
                    "A technical momentum indicator that compares a security's closing price to its price range over a given time period. The oscillator's sensitivity to market movements can be reduced by adjusting the time period or by taking a moving average of the result."
                ),
                icon: IndicatorStochasticOscillatorIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'SMI',
                name: localize('Stochastic Momentum Index'),
                short_name: localize('Stch Mtm'),
                description: localize(
                    'The Stochastic Momentum Index (SMI) helps to identify overbought or oversold conditions in the market and to predict bearish or bullish trends. It calculates the distance between the current closing price and the median of the high/low range, and displays 2 lines on the chart: the first (known as %K) represents the price movement while the second (known as %D) is a moving average of the first line. If the closing price is higher than the median of the high/low range, the SMI returns a positive value. If the closing price is lower than the average price, a negative value is returned. Values above 40 indicate a bullish trend while values below -40 indicate a bearish trend.'
                ),
                icon: IndicatorStochasticMomentumIcon,
            },
            {
                flutter_chart_id: 'WilliamsR',
                name: localize("William's Percent Range"),
                short_name: localize("William's %R"),
                description: localize(
                    'Developed by Larry Williams, Williams %R is a momentum indicator that is the inverse of the Fast Stochastic Oscillator. Also referred to as %R, Williams %R reflects the level of the close relative to the highest high for the look-back period.'
                ),
                icon: IndicatorWilliamPercentIcon,
                isPrediction: true,
            },
        ],
    },
    {
        category: 'trend',
        name: localize('Trend'),
        icon: IndicatorCatTrendLightIcon,
        items: [
            {
                flutter_chart_id: 'Aroon',
                name: localize('Aroon'),
                short_name: localize('Aroon'),
                description: localize(
                    'Developed by Tushar Chande in 1995, Aroon is an indicator system that determines whether a stock is trending or not and how strong the trend is. There are two separate indicators: Aroon-Up and Aroon-Down. A 25-day Aroon-Up measures the number of days since a 25-day high. A 25-day Aroon-Down measures the number of days since a 25-day low.'
                ),
                icon: IndicatorAroonIcon,
            },
            {
                flutter_chart_id: 'adx',
                name: localize('ADX/DMS'),
                short_name: localize('ADX'),
                description: localize(
                    'The Average Directional Movement Index index (ADX) was developed in 1978 by J. Welles Wilder as an indicator of trend strength in a series of prices of a financial instrument ADX will range between 0 and 100. Generally, ADX readings below 20 indicate trend weakness, and readings above 40 indicate trend strength.'
                ),
                icon: IndicatorAdxIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'commodity_channel_index',
                name: localize('Commodity Channel Index'),
                short_name: localize('CCI'),
                description: localize(
                    'The Commodity Channel Index (CCI) is a versatile indicator that can be used to identify a new trend or warn of extreme conditions.'
                ),
                icon: IndicatorCommodityChannelIndexIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'ichimoku',
                name: localize('Ichimoku Clouds'),
                short_name: localize('Ichimoku Clouds'),
                description: localize(
                    'The Ichimoku Cloud, also known as Ichimoku Kinko Hyo, is a versatile indicator that defines support and resistance, identifies trend direction, gauges momentum and provides trading signals. Ichimoku Kinko Hyo translates into “one look equilibrium chart”.'
                ),
                icon: IndicatorIchimokuIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'ParabolicSAR',
                name: localize('Parabolic SAR'),
                short_name: localize('PSAR'),
                description: localize(
                    'The parabolic SAR is calculated almost independently for each trend in the price. When the price is in an uptrend, the SAR emerges below the price and converges upwards towards it. Similarly, on a downtrend, the SAR emerges above the price and converges downwards. At each step within a trend, the SAR is calculated one period in advance.'
                ),
                icon: IndicatorParabolicIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'zigzag',
                name: localize('Zig Zag'),
                short_name: localize('Zig Zag'),
                description: localize(
                    'Zig Zag helps to identify trend reversals and filters out relatively small price movements by determining the support and resistance levels of the market. It accepts a percentage of deviation as the input and displays a line if the price change is larger than the percentage of deviation. Zig Zag ignores any sideways movement and is useful to filter out “market noise”.'
                ),
                icon: IndicatorZigZagIcon,
                isPrediction: true,
            },
        ],
    },
    {
        category: 'volatility',
        name: localize('Volatility'),
        icon: IndicatorCatVolatilityIcon,
        items: [
            {
                flutter_chart_id: 'bollinger_bands',
                name: localize('Bollinger Bands'),
                short_name: localize('Bollinger Bands'),
                description: localize(
                    'Bollinger Bands can be used to measure the highness or lowness of the price relative to previous trades.'
                ),
                icon: IndicatorBollingerIcon,
            },
            {
                flutter_chart_id: 'donchian_channel',
                name: localize('Donchian Channel'),
                short_name: localize('Donchian Channel'),
                description: localize(
                    'The Donchian Channel is an indicator used in market trading developed by Richard Donchian. It is formed by taking the highest high and the lowest low of the last n periods. The area between the high and the low is the channel for the period chosen.'
                ),
                icon: IndicatorDonchianIcon,
                isPrediction: true,
            },
        ],
    },
    {
        category: 'moving-averages',
        name: localize('Moving averages'),
        icon: IndicatorCatAveragesIcon,
        items: [
            {
                flutter_chart_id: 'moving_average',
                name: localize('Moving Average (MA)'),
                short_name: localize('MA'),
                description: localize(
                    'The Moving Average (MA) helps to identify the overall market trend by filtering out short-term price fluctuations. Using historical data, it calculates the average price over a specific period and plots a line on the chart. If the MA line moves upwards, it’s an indicator of an uptrend, a downtrend if it moves downwards. A buy signal occurs when the price moves above the MA line.'
                ),
                icon: IndicatorAveragesIcon,
            },
            {
                flutter_chart_id: 'moving_envelope_average',
                name: localize('Moving Average Envelope'),
                short_name: localize('MA Env'),
                description: localize(
                    'The Moving Average Envelope (MAE) helps to identify strong price movement that indicates the start of a trend. The MAE creates a moving average line as well as 2 bands around it. In theory, when the market price touches the upper or lower bands, a trend reversal will occur, indicating a buy signal.'
                ),
                icon: IndicatorEnvelopeIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'rainbow',
                name: localize('Rainbow Moving Average'),
                short_name: localize('Rainbow MA'),
                description: localize(
                    'The Rainbow Moving Average (RMA) displays several moving average lines simultaneously. When the lines intersect, it’s an indicator of price reversal and the angle of the lines are helpful to predict the trend strength. The steeper the curve, the stronger the trend. When the price crosses the moving average lines from below, it signals an upward trend. When the price crosses the moving average lines from above, it signals a downward trend. The RMA is easier to use compared to using several different moving average indicators at once.'
                ),
                icon: IndicatorRainbowIcon,
                isPrediction: true,
            },
        ],
    },
    {
        category: 'others',
        name: localize('Others'),
        icon: IndicatorCatOtherIcon,
        items: [
            {
                flutter_chart_id: 'alligator',
                name: localize('Alligator'),
                short_name: localize('Alligator'),
                description: localize(
                    'Bill Williams introduced the Alligator indicator in 1995. The Alligator is as much a metaphor as it is an indicator. It consists of three lines, overlaid on a pricing chart, that represent the jaw, the teeth and the lips of the beast, and was created to help the trader confirm the presence of a trend and its direction. The Alligator indicator can also help traders designate impulse and corrective wave formations, but the tool works best when combined with a momentum indicator.'
                ),
                icon: IndicatorAlligatorIcon,
                isPrediction: true,
            },
            {
                flutter_chart_id: 'fcb',
                name: localize('Fractal Chaos Band'),
                short_name: localize('Fractal Chaos Band'),
                description: localize(
                    'Fractals are indicators on candlestick charts that identify reversal points in the market. Traders often use fractals to get an idea about the direction in which the price will develop. A fractal will form when a particular price pattern happens on a chart.'
                ),
                icon: IndicatorFractalChaosIcon,
                isPrediction: true,
            },
        ],
    },
];

const lineStyle = {
    thickness: 1,
    hasArea: false,
};

export const getDrawingToolConfig = {
    lineStyle: clone(lineStyle),
    pattern: 'solid',
    isOverlay: true,
};

const getVerticalDrawingConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        pattern: 'solid',
        color: '#000000',
        isOverlay: true,
    },
    parameters: [
        {
            path: 'lineStyle',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'enableLabel',
            title: localize('Axis Label'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getLineDrawingConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        pattern: 'solid',
        color: '#000000',
        isOverlay: true,
    },
    parameters: [
        {
            path: 'lineStyle',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
    ],
});

const getTrendlDrawingConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        pattern: 'solid',
        color: '#000000',
        isOverlay: true,
    },
    parameters: [
        {
            path: 'lineStyle',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'fillStyle',
            title: localize('Fill Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
    ],
});

export const defaultdrawToolsConfigs: TDefaultIndicatorConfigMap = {
    vertical: getVerticalDrawingConfig,
    line: getLineDrawingConfig,
    ray: getLineDrawingConfig,
    trend: getTrendlDrawingConfig,
    channel: getTrendlDrawingConfig,
    fibfan: getTrendlDrawingConfig,
    rectangle: getTrendlDrawingConfig,
    horizontal: getVerticalDrawingConfig,
    continuous: getLineDrawingConfig,
};

export const getDefaultDrawingConfig = (drawTool: keyof typeof defaultIndicatorConfigs) => {
    return defaultdrawToolsConfigs[drawTool]();
};

const getFieldTypeOptions = () => ({
    open: localize('Open'),
    high: localize('High'),
    low: localize('Low'),
    close: localize('Close'),
    'Hl/2': localize('Hl/2'),
    'HlC/3': localize('Hlc/3'),
    'HlCC/4': localize('Hlcc/4'),
    'OHlC/4': localize('Ohlc/4'),
});

const getMovingAverageTypeOptions = () => ({
    simple: localize('Simple'),
    exponential: localize('Exponential'),
    weighted: localize('Weighted'),
    hull: localize('Hull'),
    zeroLag: localize('Zero Lag'),
    timeSeries: localize('Time Series'),
    wellesWilder: localize('Welles Wilder'),
    variable: localize('Variable'),
    triangular: localize('Triangular'),
    doubleExponential: localize('2-Exponential'),
    tripleExponential: localize('3-Exponential'),
});

const getRSIIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        oscillatorLinesConfig: {
            overboughtStyle: clone(lineStyle),
            oversoldStyle: clone(lineStyle),
        },
        pinLabels: false,
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            paths: {
                value: 'oscillatorLinesConfig.overboughtValue',
                color: 'oscillatorLinesConfig.overboughtStyle.color',
            },
            group_key: 'over_bought',
            title: localize('OverBought'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: 80,
                color: '#787d88',
            },
        },
        {
            paths: {
                value: 'oscillatorLinesConfig.oversoldValue',
                color: 'oscillatorLinesConfig.oversoldStyle.color',
            },
            group_key: 'over_sold',
            title: localize('OverSold'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: 20,
                color: '#787d88',
            },
        },
        {
            path: 'showZones',
            group_key: 'show_zones',
            title: localize('Show Zones'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getADXIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        positiveLineStyle: clone(lineStyle),
        negativeLineStyle: clone(lineStyle),
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'positiveLineStyle.color',
            title: localize('+DI'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'negativeLineStyle.color',
            title: localize('-DI'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'barStyle.positiveColor',
            title: localize('Positive Bar'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'barStyle.negativeColor',
            title: localize('Negative Bar'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'smoothingPeriod',
            title: localize('Smoothing Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'showSeries',
            title: localize('Series'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
        {
            path: 'showShading',
            title: localize('Shading'),
            type: 'switch',
            category: 'parameters',
            defaultValue: false,
        },
        {
            path: 'showHistogram',
            title: localize('Histogram'),
            type: 'switch',
            category: 'parameters',
            defaultValue: false,
        },
    ],
});

const getAwesomeOscillatorIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'barStyle.positiveColor',
            title: localize('Increasing Bar'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'barStyle.negativeColor',
            title: localize('Decreasing Bar'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
    ],
});

const getDPOIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        isCentered: true,
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            path: 'movingAverageType',
            title: localize('Moving Average Type'),
            defaultValue: 'simple',
            category: 'inputs',
            type: 'select',
            options: getMovingAverageTypeOptions(),
        },
    ],
});

const getGatorIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'barStyle.positiveColor',
            title: localize('Increasing Bar'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'barStyle.negativeColor',
            title: localize('Decreasing Bar'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'jawPeriod',
            title: localize('Jaw Period'),
            defaultValue: 13,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'jawOffset',
            title: localize('Jaw Offset'),
            defaultValue: 8,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'teethPeriod',
            title: localize('Teeth Period'),
            defaultValue: 8,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'teethOffset',
            title: localize('Teeth Offset'),
            defaultValue: 5,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'lipsPeriod',
            title: localize('Lips Period'),
            defaultValue: 5,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'lipsOffset',
            title: localize('Lips Offset'),
            defaultValue: 3,
            category: 'inputs',
            type: 'number',
        },
    ],
});

const getMACDIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        signalLineStyle: clone(lineStyle),
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'signalLineStyle.color',
            title: localize('Signal'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'barStyle.positiveColor',
            title: localize('Increasing Bar'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'barStyle.negativeColor',
            title: localize('Decreasing Bar'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'fastMAPeriod',
            title: localize('Fast MA Period'),
            defaultValue: 12,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'slowMAPeriod',
            title: localize('Slow MA Period'),
            defaultValue: 26,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'signalPeriod',
            title: localize('Signal Period'),
            defaultValue: 9,
            category: 'inputs',
            type: 'number',
        },
    ],
});

const getROCIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        pipSize: 4,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
    ],
});

const getStochasticOscillatorIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: { ...clone(lineStyle), color: '#FFFFFF' },
        fastLineStyle: clone(lineStyle),
        slowLineStyle: clone(lineStyle),
        oscillatorLinesConfig: {
            overboughtStyle: clone(lineStyle),
            oversoldStyle: clone(lineStyle),
        },
        pinLabels: false,
        overBoughtPrice: 80,
        overSoldPrice: 20,
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'fastLineStyle.color',
            title: localize('Fast'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'slowLineStyle.color',
            title: localize('Slow'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            path: 'isSmooth',
            title: localize('Smooth'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
        {
            paths: {
                value: 'oscillatorLinesConfig.overboughtValue',
                color: 'oscillatorLinesConfig.overboughtStyle.color',
            },
            group_key: 'over_bought',
            title: localize('OverBought'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: 80,
                color: '#787d88',
            },
        },
        {
            paths: {
                value: 'oscillatorLinesConfig.oversoldValue',
                color: 'oscillatorLinesConfig.oversoldStyle.color',
            },
            group_key: 'over_sold',
            title: localize('OverSold'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: 20,
                color: '#787d88',
            },
        },
        {
            path: 'showZones',
            group_key: 'show_zones',
            title: localize('Show Zones'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getSMIIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        signalLineStyle: clone(lineStyle),
        pipSize: 2,
        showLastIndicator: true,
        smiOscillatorLimits: {
            // Overwritten by the OverBought/OverSold parameters below; kept in step with
            // their defaults so the two never disagree about the palette.
            overboughtStyle: { ...clone(lineStyle), color: '#787d88' },
            oversoldStyle: { ...clone(lineStyle), color: '#787d88' },
        },
    },
    parameters: [
        {
            path: 'lineStyle.color',
            group_key: '%k',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            group_key: '%k',
            title: localize('Period'),
            defaultValue: 10,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'smoothingPeriod',
            group_key: '%k',
            title: localize('Smoothing Period'),
            defaultValue: 3,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'doubleSmoothingPeriod',
            group_key: '%k',
            title: localize('Double Smoothing Period'),
            defaultValue: 3,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'signalLineStyle.color',
            group_key: '%d',
            title: localize('Color'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'signalPeriod',
            group_key: '%d',
            title: localize('Signal Period'),
            defaultValue: 10,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'maType',
            group_key: '%d',
            title: localize('Field'),
            defaultValue: 'exponential',
            category: 'inputs',
            type: 'select',
            options: getMovingAverageTypeOptions(),
        },
        {
            paths: {
                value: 'smiOscillatorLimits.overboughtValue',
                color: 'smiOscillatorLimits.overboughtStyle.color',
            },
            group_key: 'over_bought',
            title: localize('OverBought'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: 40,
                color: '#787d88',
            },
        },
        {
            paths: {
                value: 'smiOscillatorLimits.oversoldValue',
                color: 'smiOscillatorLimits.oversoldStyle.color',
            },
            group_key: 'over_sold',
            title: localize('OverSold'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: -40,
                color: '#787d88',
            },
        },
        {
            path: 'showZones',
            group_key: 'show_zones',
            title: localize('Show Zones'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getWilliamsRIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        zeroHorizontalLinesStyle: { ...clone(lineStyle), color: '0xFFF44336' },
        oscillatorLimits: {
            overboughtStyle: clone(lineStyle),
            oversoldStyle: clone(lineStyle),
        },
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
        {
            paths: {
                value: 'oscillatorLimits.overboughtValue',
                color: 'oscillatorLimits.overboughtStyle.color',
            },
            group_key: 'over_bought',
            title: localize('OverBought'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: -20,
                color: '#787d88',
            },
        },
        {
            paths: {
                value: 'oscillatorLimits.oversoldValue',
                color: 'oscillatorLimits.oversoldStyle.color',
            },
            group_key: 'over_sold',
            title: localize('OverSold'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: -80,
                color: '#787d88',
            },
        },
        {
            path: 'showZones',
            group_key: 'show_zones',
            title: localize('Show Zones'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getAroonIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        upLineStyle: clone(lineStyle),
        downLineStyle: clone(lineStyle),
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'upLineStyle.color',
            title: localize('Aroon Up'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'downLineStyle.color',
            title: localize('Aroon Down'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 14,
            category: 'inputs',
            type: 'number',
        },
    ],
});

const getCCIIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        oscillatorLinesConfig: {
            overboughtStyle: clone(lineStyle),
            oversoldStyle: clone(lineStyle),
        },
        pipSize: 2,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 20,
            category: 'inputs',
            type: 'number',
        },
        {
            paths: {
                value: 'oscillatorLinesConfig.overboughtValue',
                color: 'oscillatorLinesConfig.overboughtStyle.color',
            },
            group_key: 'over_bought',
            title: localize('OverBought'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: 100,
                color: '#787d88',
            },
        },
        {
            paths: {
                value: 'oscillatorLinesConfig.oversoldValue',
                color: 'oscillatorLinesConfig.oversoldStyle.color',
            },
            group_key: 'over_sold',
            title: localize('OverSold'),
            type: 'numbercolorpicker',
            category: 'parameters',
            defaultValue: {
                value: -100,
                color: '#787d88',
            },
        },
        {
            path: 'showZones',
            group_key: 'show_zones',
            title: localize('Show Zones'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getIchimokuIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        conversionLineStyle: clone(lineStyle),
        baseLineStyle: clone(lineStyle),
        spanALineStyle: clone(lineStyle),
        laggingLineStyle: clone(lineStyle),
        spanBLineStyle: clone(lineStyle),
        conversionLinePeriod: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'conversionLineStyle.color',
            title: localize('Conversion Line'),
            defaultValue: '#5569f9',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'baseLineStyle.color',
            title: localize('Base Line'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'spanALineStyle.color',
            title: localize('Leading Span A'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'spanBLineStyle.color',
            title: localize('Leading Span B'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'laggingLineStyle.color',
            title: localize('Lagging Span'),
            defaultValue: '#e18d00',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'conversionLinePeriod',
            title: localize('Conversion Line Period'),
            defaultValue: 9,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'baseLinePeriod',
            title: localize('Base Line Period'),
            defaultValue: 26,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'spanBPeriod',
            title: localize('Leading Span B Period'),
            defaultValue: 52,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'laggingSpanOffset',
            title: localize('Lagging Span Period'),
            defaultValue: -26,
            category: 'inputs',
            type: 'number',
            min: -100,
            max: 0,
        },
    ],
});

const getParabolicSARIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        scatterStyle: {
            radius: 1.5,
        },
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'scatterStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'minAccelerationFactor',
            title: localize('Minimum AF'),
            defaultValue: 0.02,
            category: 'inputs',
            type: 'number',
            step: 0.01,
        },
        {
            path: 'maxAccelerationFactor',
            title: localize('Maximum AF'),
            defaultValue: 0.2,
            category: 'inputs',
            type: 'number',
            step: 0.01,
        },
    ],
});

const getZigzagIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'distance',
            title: localize('Distance(%)'),
            defaultValue: 10,
            category: 'inputs',
            type: 'number',
        },
    ],
});

const getBollingerBandsIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        upperLineStyle: clone(lineStyle),
        middleLineStyle: clone(lineStyle),
        lowerLineStyle: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'upperLineStyle.color',
            title: localize('Bollinger Bands Top'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'middleLineStyle.color',
            title: localize('Bollinger Bands Median'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'lowerLineStyle.color',
            title: localize('Bollinger Bands Bottom'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'fillColor',
            title: localize('Fill Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 20,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            path: 'standardDeviation',
            title: localize('Standard Deviations'),
            defaultValue: 2,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'movingAverageType',
            title: localize('Moving Average Type'),
            defaultValue: 'simple',
            category: 'inputs',
            type: 'select',
            options: getMovingAverageTypeOptions(),
        },
        {
            path: 'showChannelFill',
            title: localize('Channel Fill'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getDonchianChannelIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        upperLineStyle: clone(lineStyle),
        middleLineStyle: clone(lineStyle),
        lowerLineStyle: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'upperLineStyle.color',
            title: localize('Donchian High'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'middleLineStyle.color',
            title: localize('Donchian Median'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'lowerLineStyle.color',
            title: localize('Donchian Low'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'fillColor',
            title: localize('Fill Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'highPeriod',
            title: localize('High Period'),
            defaultValue: 20,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'lowPeriod',
            title: localize('Low Period'),
            defaultValue: 20,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'showChannelFill',
            title: localize('Channel Fill'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getMAIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        lineStyle: clone(lineStyle),
        isOverlay: true,
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'lineStyle.color',
            title: localize('Color'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 50,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            path: 'movingAverageType',
            title: localize('Type'),
            defaultValue: 'simple',
            category: 'inputs',
            type: 'select',
            options: getMovingAverageTypeOptions(),
        },
        {
            path: 'offset',
            title: localize('Offset'),
            defaultValue: 0,
            category: 'inputs',
            type: 'number',
        },
    ],
});

const getMAEnvIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        upperLineStyle: clone(lineStyle),
        middleLineStyle: clone(lineStyle),
        lowerLineStyle: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'upperLineStyle.color',
            title: localize('MA Env Top'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'middleLineStyle.color',
            title: localize('MA Env Median'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'lowerLineStyle.color',
            title: localize('MA Env Bottom'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'fillColor',
            title: localize('Fill Color'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 50,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            path: 'shiftType',
            title: localize('Shift Type'),
            defaultValue: 'percent',
            category: 'inputs',
            type: 'select',
            options: {
                percent: localize('Percent'),
                point: localize('Point'),
            },
        },
        {
            path: 'shift',
            title: localize('Shift'),
            defaultValue: 5,
            category: 'inputs',
            type: 'number',
        },

        {
            path: 'movingAverageType',
            title: localize('Type'),
            defaultValue: 'simple',
            category: 'inputs',
            type: 'select',
            options: getMovingAverageTypeOptions(),
        },
        {
            path: 'showChannelFill',
            title: localize('Channel Fill'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

const getRainbowIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        bandsCount: 10,
        movingAverageType: 'simple',
        rainbowLineStyles: [],
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'period',
            title: localize('Period'),
            defaultValue: 2,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'fieldType',
            title: localize('Field'),
            defaultValue: 'close',
            category: 'inputs',
            type: 'select',
            options: getFieldTypeOptions(),
        },
        {
            path: 'rainbowLineStyles[0].color',
            title: localize('SMA1'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[1].color',
            title: localize('SMA2'),
            defaultValue: '#f88f54',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[2].color',
            title: localize('SMA3'),
            defaultValue: '#ffbe4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[3].color',
            title: localize('SMA4'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[4].color',
            title: localize('SMA5'),
            defaultValue: '#00822a',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[5].color',
            title: localize('SMA6'),
            defaultValue: '#54bdc8',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[6].color',
            title: localize('SMA7'),
            defaultValue: '#098d9c',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[7].color',
            title: localize('SMA8'),
            defaultValue: '#53b9ff',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[8].color',
            title: localize('SMA9'),
            defaultValue: '#5569f9',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'rainbowLineStyles[9].color',
            title: localize('SMA10'),
            defaultValue: '#a556dd',
            category: 'inputs',
            type: 'colorpicker',
        },
    ],
});

const getAlligatorIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        jawLineStyle: clone(lineStyle),
        teethLineStyle: clone(lineStyle),
        lipsLineStyle: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'jawLineStyle.color',
            title: localize('Jaw'),
            defaultValue: '#5569f9',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'teethLineStyle.color',
            title: localize('Teeth'),
            defaultValue: '#ff4d4d',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'lipsLineStyle.color',
            title: localize('Lips'),
            defaultValue: '#4dbc6b',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'showLines',
            title: localize('Show Lines'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
        {
            path: 'jawPeriod',
            title: localize('Jaw Period'),
            defaultValue: 13,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'jawOffset',
            title: localize('Jaw Offset'),
            defaultValue: 8,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'teethPeriod',
            title: localize('Teeth Period'),
            defaultValue: 8,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'teethOffset',
            title: localize('Teeth Offset'),
            defaultValue: 5,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'lipsPeriod',
            title: localize('Lips Period'),
            defaultValue: 5,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'lipsOffset',
            title: localize('Lips Offset'),
            defaultValue: 3,
            category: 'inputs',
            type: 'number',
        },
        {
            path: 'showFractal',
            title: localize('Show Fractals'),
            type: 'switch',
            category: 'parameters',
            defaultValue: false,
        },
    ],
});

const getFractalChaosBandIndicatorConfig: TDefaultIndicatorConfigFn = () => ({
    config: {
        highLineStyle: clone(lineStyle),
        lowLineStyle: clone(lineStyle),
        showLastIndicator: true,
    },
    parameters: [
        {
            path: 'highLineStyle.color',
            title: localize('Fractal High'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'lowLineStyle.color',
            title: localize('Fractal Low'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'fillColor',
            title: localize('Fractal Channel'),
            defaultValue: '#787d88',
            category: 'inputs',
            type: 'colorpicker',
        },
        {
            path: 'showChannelFill',
            title: localize('Channel Fill'),
            type: 'switch',
            category: 'parameters',
            defaultValue: true,
        },
    ],
});

export const defaultIndicatorConfigs: TDefaultIndicatorConfigMap = {
    // Keys are mapped to the flutter indicators name. Don't change it.
    RSI: getRSIIndicatorConfig,
    adx: getADXIndicatorConfig,
    AwesomeOscillator: getAwesomeOscillatorIndicatorConfig,
    dpo: getDPOIndicatorConfig,
    gator: getGatorIndicatorConfig,
    macd: getMACDIndicatorConfig,
    ROC: getROCIndicatorConfig,
    StochasticOscillator: getStochasticOscillatorIndicatorConfig,
    SMI: getSMIIndicatorConfig,
    WilliamsR: getWilliamsRIndicatorConfig,
    Aroon: getAroonIndicatorConfig,
    commodity_channel_index: getCCIIndicatorConfig,
    ichimoku: getIchimokuIndicatorConfig,
    ParabolicSAR: getParabolicSARIndicatorConfig,
    zigzag: getZigzagIndicatorConfig,
    bollinger_bands: getBollingerBandsIndicatorConfig,
    donchian_channel: getDonchianChannelIndicatorConfig,
    moving_average: getMAIndicatorConfig,
    moving_envelope_average: getMAEnvIndicatorConfig,
    rainbow: getRainbowIndicatorConfig,
    alligator: getAlligatorIndicatorConfig,
    fcb: getFractalChaosBandIndicatorConfig,
};

export const getDefaultIndicatorConfig = (indicator: keyof typeof defaultIndicatorConfigs) => {
    return defaultIndicatorConfigs[indicator]();
};

export const ChartTypes = [
    { id: 'line', text: localize('Area'), candleOnly: false, icon: TypeAreaIcon },
    { id: 'candles', text: localize('Candle'), candleOnly: true, icon: TypeCandleIcon },
    { id: 'hollow', text: localize('Hollow'), candleOnly: true, icon: TypeHollowIcon },
    { id: 'ohlc', text: localize('OHLC'), candleOnly: true, icon: TypeOhlcIcon },
];

type TInterval = {
    key: string;
    single: string;
    plural?: string;
    items: {
        interval: TGranularity;
        num: number;
    }[];
}[];

export const Intervals: TInterval = [
    {
        key: 'tick',
        single: localize('tick'),
        items: [
            {
                interval: 0,
                num: 1,
            },
        ],
    },
    {
        key: 'minute',
        single: localize('minute'),
        plural: localize('minutes'),
        items: [
            { interval: 60, num: 1 },
            { interval: 120, num: 2 },
            { interval: 180, num: 3 },
            { interval: 300, num: 5 },
            { interval: 600, num: 10 },
            { interval: 900, num: 15 },
            { interval: 1800, num: 30 },
        ],
    },
    {
        key: 'hour',
        single: localize('hour'),
        plural: localize('hours'),
        items: [
            { interval: 3600, num: 1 },
            { interval: 7200, num: 2 },
            { interval: 14400, num: 4 },
            { interval: 28800, num: 8 },
        ],
    },
    {
        key: 'day',
        single: localize('day'),
        plural: localize('days'),
        items: [{ interval: 86400, num: 1 }],
    },
];

export const Languages = [
    {
        key: 'en',
        name: 'English',
        icon: <FlagIcons.GBP />,
    },
    {
        key: 'bn',
        name: 'বাংলা',
        icon: <FlagIcons.Bangladesh />,
    },
    {
        key: 'de',
        name: 'Deutsch',
        icon: <FlagIcons.German />,
    },
    {
        key: 'ar',
        name: 'العربية',
        icon: <FlagIcons.Arabic />,
    },
    {
        key: 'fr',
        name: 'French',
        icon: <FlagIcons.French />,
    },
    {
        key: 'mn',
        name: 'Монгол',
        icon: <FlagIcons.Mongolian />,
    },
    {
        key: 'ru',
        name: 'Русский',
        icon: <FlagIcons.Russia />,
    },
    {
        key: 'si',
        name: 'සිංහල',
        icon: <FlagIcons.Srilanka />,
    },
    {
        key: 'sw',
        name: 'Kiswahili',
        icon: <FlagIcons.Kenya />,
    },
    {
        key: 'th',
        name: 'Thai',
        icon: <FlagIcons.Thailand />,
    },
    {
        key: 'id',
        name: 'Indonesia',
        icon: <FlagIcons.Indonesia />,
    },
    {
        key: 'vi',
        name: 'Tiếng Việt',
        icon: <FlagIcons.Vietnam />,
    },
    {
        key: 'it',
        name: 'Italiano',
        icon: <FlagIcons.Italy />,
    },
    {
        key: 'km',
        name: 'ខ្មែរ',
        icon: <FlagIcons.Cambodia />,
    },
    {
        key: 'ko',
        name: '한국어',
        icon: <FlagIcons.Korean />,
    },
    {
        key: 'pt',
        name: 'Português',
        icon: <FlagIcons.Portugal />,
    },
    {
        key: 'tr',
        name: 'Türkçe',
        icon: <FlagIcons.Turkey />,
    },
    {
        key: 'uz',
        name: "O'zbek",
        icon: <FlagIcons.Uzbekistan />,
    },
    {
        key: 'zh_cn',
        name: '简体中文',
        icon: <FlagIcons.Chinese />,
    },
    {
        key: 'pl',
        name: 'Polish',
        icon: <FlagIcons.Poland />,
    },
    {
        key: 'zh_tw',
        name: '繁體中文',
        icon: <FlagIcons.ChineseTraditional />,
    },
    {
        key: 'es',
        name: 'espanyol',
        icon: <FlagIcons.Spanish />,
    },
    {
        key: 'ta',
        name: 'தமிழ்',
        icon: <FlagIcons.India />,
    },
];
export const STATE = {
    CHART_MODE_MODAL_OPEN: 'CHART_MODE_MODAL_OPEN',
    CHART_INTERVAL_CHANGE: 'CHART_INTERVAL_CHANGE',
    CHART_TYPE_CHANGE: 'CHART_TYPE_CHANGE',
    CHART_SWITCH_TOGGLE: 'CHART_SWITCH_TOGGLE',
    MARKET_MENU_MODAL_TOGGLE: 'MARKET_MENU_MODAL_TOGGLE',
    FAVORITE_MARKETS_TOGGLE: 'FAVORITE_MARKETS_TOGGLE',
    INDICATOR_ADDED: 'INDICATOR_ADDED',
    INDICATOR_DELETED: 'INDICATOR_DELETED',
    INDICATOR_EDITED: 'INDICATOR_EDITED',
    INDICATOR_INFO_TOGGLE: 'INDICATOR_INFO_TOGGLE',
    INDICATOR_SEARCH: 'INDICATOR_SEARCH',
    INDICATOR_SETTINGS_OPEN: 'INDICATOR_SETTINGS_OPEN',
    INDICATORS_CLEAR_ALL: 'INDICATORS_CLEAR_ALL',
    INDICATORS_MODAL_OPEN: 'INDICATORS_MODAL_OPEN',
    INITIAL: 'INITIAL',
    MARKET_SEARCH: 'MARKET_SEARCH',
    MARKET_STATE_CHANGE: 'MARKET_STATE_CHANGE',
    READY: 'READY',
    SCROLL_TO_LEFT: 'SCROLL_TO_LEFT',
    SYMBOL_CHANGE: 'SYMBOL_CHANGE',
    DRAWING_TOOLS_OPEN: 'DRAWING_TOOLS_OPEN',
    DRAWING_TOOLS_ADD: 'DRAWING_TOOLS_ADD',
    DRAWING_TOOLS_DELETE: 'DRAWING_TOOLS_DELETE',
    DRAWING_TOOLS_EDIT_PX: 'DRAWING_TOOLS_EDIT_PX',
    DRAWING_TOOLS_EDIT_COLOR: 'DRAWING_TOOLS_EDIT_COLOR',
    DRAWING_TOOLS_MODAL_OPEN: 'DRAWING_TOOLS_MODAL_OPEN',
    CROSSHAIR_CLICK: 'CROSSHAIR_CLICK',
} as const;

export const TooltipsContent = {
    predictionIndicator: localize(
        'This indicator does not support 1-tick intervals. To use this indicator, change your chart time interval to 1 minute or more.'
    ),
};

export const getIndicatorCategoryName = (id: string) =>
    getIndicatorsTree()
        .find(categories => categories.items.some(item => item.flutter_chart_id === id))
        ?.category.replace('-', ' ') ?? '';
