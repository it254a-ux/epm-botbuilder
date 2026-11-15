import 'dart:ui' as ui;

import 'package:chart_app/src/interop/js_interop.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';

/// CustomLinePainter
class CustomLinePainter extends LinePainter {
  /// Intialize
  CustomLinePainter(DataSeries<Tick> series) : super(series);

  @override
  void onPaintData(
    Canvas canvas,
    Size size,
    EpochToX epochToX,
    QuoteToY quoteToY,
    AnimationInfo animationInfo,
  ) {
    super.onPaintData(canvas, size, epochToX, quoteToY, animationInfo);

    // Compute the lerped quote value exactly as Flutter does for the line
    // animation. This ensures JS barriers use the exact same interpolated
    // value.
    //
    // This intentionally does NOT check whether the newest tick is inside
    // `series.visibleEntries`. That check belongs to the line geometry (the
    // line is only drawn up to the last *visible* tick), but a barrier's
    // price is anchored to the newest quote regardless of scroll position.
    // Gating on visibility made `lerpedQuote` null whenever the chart was
    // scrolled away from the current tick, which forced JS barriers onto the
    // non-animated fallback path and made them snap between price levels.
    double? lerpedQuote;
    final List<Tick>? entries = series.entries;

    if (entries != null && entries.isNotEmpty && series.prevLastEntry != null) {
      final Tick lastTick = entries.last;
      final Tick prevLastTick = series.prevLastEntry!.entry;

      if (!lastTick.quote.isNaN && !prevLastTick.quote.isNaN) {
        lerpedQuote = ui.lerpDouble(
          prevLastTick.quote,
          lastTick.quote,
          animationInfo.currentTickPercent,
        );
      }
    }

    JsInterop.onMainSeriesPaint(animationInfo.currentTickPercent, lerpedQuote);
  }
}
