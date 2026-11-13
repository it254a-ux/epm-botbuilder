import { getUrlBase } from '@deriv/shared';
import { setSmartChartsPublicPath } from '@deriv-com/smartcharts-champion';

// Set SmartCharts public path
// EPM: the chart files live under /dtrader-app on this site (the template expects them at the site root).
setSmartChartsPublicPath('/dtrader-app/js/smartcharts/');

// Export all SmartChart components directly
export {
    SmartChart,
    ChartTitle,
    ChartSize,
    ChartMode,
    DrawTools,
    Share,
    StudyLegend,
    Views,
    ToolbarWidget,
    FastMarker,
    RawMarker,
} from '@deriv-com/smartcharts-champion';
