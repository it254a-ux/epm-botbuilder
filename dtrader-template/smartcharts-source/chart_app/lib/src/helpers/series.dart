import 'package:chart_app/src/models/chart_config.dart';
import 'package:chart_app/src/models/chart_feed.dart';
import 'package:chart_app/src/series/custom_line_series.dart';
import 'package:deriv_chart/core_chart.dart';

/// Gets the data series
DataSeries<Tick> getDataSeries(
    ChartFeedModel feedModel, ChartConfigModel configModel, int granularity) {
  final List<Tick> ticks = feedModel.ticks;
  // Min granularity 1m
  if (ticks is List<Candle> && granularity >= 60000) {
    final CandleStyle style = configModel.theme.candleStyle;

    switch (configModel.style) {
      case ChartStyle.candles:
        return CandleSeries(ticks, style: style);
      case ChartStyle.hollow:
        return HollowCandleSeries(ticks, style: style);
      case ChartStyle.ohlc:
        return OhlcCandleSeries(ticks, style: style);
      default:
        break;
    }
  }
  // Not `theme.lineStyle`: the Area chart's colour, thickness and gradient
  // fill are host-configurable, and `configModel.lineStyle` layers those
  // choices over the theme's own.
  return CustomLineSeries(
    ticks,
    style: configModel.lineStyle,
  );
}
