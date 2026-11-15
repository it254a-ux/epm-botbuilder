import 'package:chart_app/src/painters/custom_line_painter.dart';
import 'package:deriv_chart/core_chart.dart';

/// CustomLineSeries
class CustomLineSeries extends LineSeries {
  /// Initializes a line series.
  CustomLineSeries(
    List<Tick> entries, {
    String? id,
    LineStyle? style,
    HorizontalBarrierStyle? lastTickIndicatorStyle,
  }) : super(
          entries,
          id: id,
          style: style,
          lastTickIndicatorStyle: lastTickIndicatorStyle,
        );

  @override
  SeriesPainter<DataSeries<Tick>> createPainter() => CustomLinePainter(
        this,
      );

  @override
  bool shouldRepaint(ChartData? oldDelegate) {
    // Keep repainting while a current-tick transition is in flight, even when
    // the newest tick is scrolled out of view.
    //
    // `DataSeries.shouldRepaint` only reports an in-flight tick animation when
    // `entries.last == visibleEntries.last`, i.e. when the newest tick is
    // inside the viewport. That is correct for the canvas in isolation — if
    // the animating tick is off-screen, none of the painted pixels change.
    //
    // But the HTML barriers (`PriceLineStore.drawBarrier`) derive their
    // animated position from `JsInterop.onMainSeriesPaint`, which is only
    // emitted while this canvas repaints. So once the chart is scrolled away
    // from the current tick, `CustomPaint` stopped calling `paint()` for the
    // whole transition, no paint callback reached JS, and barriers were left
    // to the `chart.lastQuote` MobX reaction — which snaps them straight to
    // the new price instead of animating.
    //
    // `prevLastEntry` is non-null for exactly the duration of the transition
    // (set in `didUpdate` on a new tick, cleared by `resetLastEntryAnimation`
    // once `currentTickPercent` reaches 1), so this is self-terminating and
    // the chart goes idle again as soon as the animation completes.
    if (prevLastEntry != null) {
      return true;
    }

    return super.shouldRepaint(oldDelegate);
  }
}
