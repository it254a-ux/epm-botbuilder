import 'package:chart_app/src/chart_app.dart';
import 'package:deriv_chart/core_chart.dart';

/// Gets painter for a contract based on the contract type
///
/// Accumulators deliberately fall through to [TickMarkerIconPainter]: their
/// barrier band is an annotation (`AccumulatorBarriersModel`), not a marker, so
/// the only markers left are the start-time and entry-spot ones the default
/// painter already draws — same as deriv_trader.
MarkerGroupIconPainter getMarkerGroupPainter(ChartApp app) {
  switch (app.configModel.contractType) {
    case 'DigitContract':
      return DigitMarkerIconPainter(pipSize: app.configModel.pipSize);

    default:
      return TickMarkerIconPainter();
  }
}
