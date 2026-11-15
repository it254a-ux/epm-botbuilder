import 'package:chart_app/src/series/time_interval_indicator.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';

/// A class for painting horizontal barriers.
class TimeIntervalPainter<T extends TimeIntervalIndicator>
    extends SeriesPainter<T> {
  /// Initializes [series].
  TimeIntervalPainter(T series) : super(series);

  late Paint _paint;

  /// Padding between lines.
  static const double padding = 4;

  /// Right margin.
  static const double rightMargin = 8;

  @override
  void onPaint({
    required Canvas canvas,
    required Size size,
    required EpochToX epochToX,
    required QuoteToY quoteToY,
    required AnimationInfo animationInfo,
  }) {
    final HorizontalBarrierStyle style =
        series.style as HorizontalBarrierStyle? ?? theme.horizontalBarrierStyle;

    _paint = Paint()
      ..style = PaintingStyle.fill
      ..strokeWidth = 1
      ..color = style.color;

    double y = quoteToY(series.quote as double);

    final double labelHalfHeight = style.labelHeight / 2;

    if (y - labelHalfHeight < 0) {
      y = labelHalfHeight;
    } else if (y + labelHalfHeight > size.height) {
      y = size.height - labelHalfHeight;
    }

    // Cap-centred rather than line-box centred, matching the current spot's
    // label directly above it: `currentSpotStyle.textStyle` carries far more
    // line height than the font's own metrics, and centring the box would sit
    // the digits low in it.
    final DigitLabelTextPainter valuePainter = DigitLabelTextPainter(
      series.timePeriod,
      style: style.textStyle,
    );

    //set Y axis below the marker
    y = y + style.labelHeight;

    // creating labelArea rectangle
    final Rect labelArea = Rect.fromCenter(
      center: Offset(
          size.width - rightMargin - padding - valuePainter.width / 2, y),
      width: valuePainter.width + padding * 4,
      height: style.labelHeight,
    );

    // Label.
    canvas.drawRect(
      labelArea,
      _paint,
    );

    valuePainter.paint(canvas, center: labelArea.center);
  }
}
