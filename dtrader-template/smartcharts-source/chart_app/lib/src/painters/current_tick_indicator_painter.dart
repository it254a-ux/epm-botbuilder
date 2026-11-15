import 'dart:ui' as ui;

import 'package:chart_app/src/interop/js_interop.dart';
import 'package:chart_app/src/series/current_tick_indicator.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';

/// Painter for [CurrentTickIndicator] that also reports the current spot's
/// animated quote to JS on every frame.
///
/// The HTML price lines (`PriceLineStore.drawBarrier`) position themselves from
/// `JsInterop.onMainSeriesPaint`. Emitting it from here — rather than only from
/// the main series painter — is what keeps them in sync with the current spot:
///
///  * `CurrentTickIndicator.shouldRepaint` is unconditionally `true`, so this
///    painter runs on every frame of the current-tick animation no matter how
///    the chart is scrolled. The main series, by contrast, is allowed to skip
///    repaints when its visible pixels would not change.
///  * It exists for every chart style. `onMainSeriesPaint` used to be emitted
///    only by `CustomLinePainter`, so on candle/hollow/OHLC series nothing ever
///    reached JS and price lines never animated at all.
///  * The value below is the exact same lerp `HorizontalBarrierPainter` uses to
///    draw the spot line itself, so the two move as one rather than merely
///    sharing a duration.
class CurrentTickIndicatorPainter
    extends HorizontalBarrierPainter<CurrentTickIndicator> {
  /// Initializes [series].
  CurrentTickIndicatorPainter(CurrentTickIndicator series) : super(series);

  @override
  void onPaint({
    required Canvas canvas,
    required Size size,
    required EpochToX epochToX,
    required QuoteToY quoteToY,
    required AnimationInfo animationInfo,
  }) {
    super.onPaint(
      canvas: canvas,
      size: size,
      epochToX: epochToX,
      quoteToY: quoteToY,
      animationInfo: animationInfo,
    );

    // Deliberately outside `super.onPaint`'s `isOnRange` early return: the spot
    // can be scrolled out of the epoch range while price lines are still on
    // screen and still need to track it.
    final BarrierObject? previousBarrier = series.previousObject;
    final double? currentQuote = series.quote;

    // Neither operand may reach `ui.lerpDouble` unvalidated. It only
    // short-circuits when *both* are NaN; a single NaN operand trips its
    // `assert(a.isFinite)` in debug builds and yields NaN in release. A null
    // operand is worse still — it is coerced to `0.0`, which would animate the
    // price line towards zero rather than towards the spot.
    //
    // Emitting `null` instead is the documented "no animated value" contract:
    // `PriceLineStore.drawBarrier` falls back to the current close. The two bad
    // inputs degrade differently, though — a bad *previous* quote only means
    // there is no valid origin to interpolate from, so the current quote is
    // still reported and the price line lands on it without a transition.
    double? animatedQuote;

    if (currentQuote != null && !currentQuote.isNaN) {
      final double? previousQuote = previousBarrier?.quote;

      animatedQuote = previousQuote == null || previousQuote.isNaN
          ? currentQuote
          : ui.lerpDouble(
              previousQuote,
              currentQuote,
              animationInfo.currentTickPercent,
            );
    }

    JsInterop.onMainSeriesPaint(
      animationInfo.currentTickPercent,
      animatedQuote,
    );
  }
}
