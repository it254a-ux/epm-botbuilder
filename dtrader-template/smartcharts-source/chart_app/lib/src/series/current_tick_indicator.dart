import 'package:chart_app/src/painters/current_tick_indicator_painter.dart';
import 'package:deriv_chart/core_chart.dart';

/// CurrentTickIndicator
class CurrentTickIndicator extends TickIndicator {
  /// Initializes a CurrentTickIndicator.
  CurrentTickIndicator(
    Tick tick, {
    String? id,
    HorizontalBarrierStyle? style,
    HorizontalBarrierVisibility visibility = HorizontalBarrierVisibility.normal,
  }) : super(
          tick,
          id: id,
          style: style,
          visibility: visibility,
        );

  @override
  bool shouldRepaint(ChartData? previous) => true;

  @override
  SeriesPainter<Series> createPainter() => CurrentTickIndicatorPainter(this);
}
