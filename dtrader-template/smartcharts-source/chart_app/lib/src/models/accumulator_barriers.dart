import 'dart:async';

import 'package:chart_app/src/interop/js_interop.dart';
import 'package:chart_app/src/models/chart_feed.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';

/// Builds the Accumulators barrier bands from the payload JS pushes through
/// `config.updateAccumulatorBarriers`.
///
/// This is the web counterpart of `AccumulatorAnnotationBuilder` +
/// `TradeChart._scheduleBarrierUpdate` in deriv_trader: the same annotations,
/// the same timing and the same retention, so both platforms render
/// Accumulators identically.
///
/// Two bands can be on screen at once, matching deriv_trader's annotation list:
///
///  * **live** — [AccumulatorIndicator] tracking the current spot. It carries
///    the P/L overlay and the profit/loss colouring once a contract is running;
///    without `profit` it is the pre-trade proposal band.
///  * **closed** — [AccumulatorsRecentlyClosedIndicator] frozen between the
///    tick before the exit and the exit itself, so a finished contract keeps
///    its band and final P/L while the next proposal already draws over it.
class AccumulatorBarriersModel extends ChangeNotifier {
  /// Initialize.
  AccumulatorBarriersModel(this._feedModel) {
    _feedModel.addListener(_onFeedChanged);

    // Block bodies, not arrows: an arrow body swallows a following `..`, which
    // would chain the cascade onto the callback's own (void) result.
    _controller
      ..onTap = () {
        JsInterop.onAccumulatorBarrierTap();
      }
      ..onPressStart = () {
        JsInterop.onAccumulatorBarrierPress();
      };
  }

  final ChartFeedModel _feedModel;

  /// How long a live barrier update is held back when the host doesn't say.
  ///
  /// Barriers and the tick they belong to arrive on separate messages; applying
  /// them the moment they land makes the band jump ahead of the spot. Delaying
  /// to just after the tick renders keeps the two in step.
  static const int _defaultBarrierDelayMs = 500;

  /// Hides the spot label, its line and the blinking dot, leaving only the
  /// band. Mirrors `AccumulatorAnnotationBuilder._hiddenSpotStyle` — minus its
  /// `hasBlinkingDot: false`, which is already the default.
  static const HorizontalBarrierStyle _hiddenSpotStyle = HorizontalBarrierStyle(
    labelShape: LabelShape.pentagon,
    hasLine: false,
    color: Colors.transparent,
    lineColor: Colors.transparent,
    labelShapeBackgroundColor: Colors.transparent,
    textStyle: TextStyle(color: Colors.transparent),
  );

  /// Makes the live band interactive. Created once and kept for the lifetime of
  /// the model: the annotation around it is rebuilt on every tick, but the
  /// interaction state (hover, preview) has to survive that.
  ///
  /// The band is a tap target: the host puts its own control on screen when the
  /// tap is reported, and moves the band from there with `previewGrowthRate`.
  final AccumulatorBarrierController _controller =
      AccumulatorBarrierController(enabled: false);

  ChartAnnotation<ChartObject>? _live;
  ChartAnnotation<ChartObject>? _closed;

  /// The accumulator bands currently on the chart. Empty when there is nothing
  /// to draw.
  List<ChartAnnotation<ChartObject>> get annotations =>
      <ChartAnnotation<ChartObject>>[
        if (_live != null) _live!,
        if (_closed != null) _closed!,
      ];

  Timer? _liveDelayTimer;
  Timer? _closedExpiryTimer;

  /// Exit epoch of the band currently retained, and of the last one whose
  /// retention has already run out — so a host that keeps reporting the same
  /// finished contract doesn't bring its band back.
  int? _closedExitEpochMs;
  int? _retiredExitEpochMs;

  /// When the most recent tick reached us. The delay is measured from here, not
  /// from when the barriers arrived, so a barrier update that is already late
  /// is applied straight away.
  DateTime? _lastTickReceiveTime;
  int? _lastTickEpoch;

  void _onFeedChanged() {
    final int? epoch =
        _feedModel.ticks.isEmpty ? null : _feedModel.ticks.last.epoch;

    if (epoch != _lastTickEpoch) {
      _lastTickEpoch = epoch;
      _lastTickReceiveTime = DateTime.now();
    }
  }

  /// Applies a new barrier payload. A null [payload] clears both bands.
  void updateBarriers(JSAccumulatorBarriers? payload) {
    if (payload == null) {
      _reset();
      return;
    }

    _applyInteraction(payload.interaction);
    _applyLive(payload.live, payload.barrierDelayMs);
    _applyClosed(payload.closed);
  }

  void _applyInteraction(JSAccumulatorBarrierInteraction? interaction) {
    if (interaction == null) {
      _controller
        ..enabled = false
        ..showTapGuide = false
        ..tapGuideLabel = null
        ..clearPreview()
        ..steps = const <AccumulatorGrowthRateStep>[];
      return;
    }

    // Order matters: the preview is applied last, so the rate it names always
    // has a rung in the ladder to land on.
    _controller
      ..steps = interaction.steps
          .map((JSAccumulatorGrowthRateStep step) => AccumulatorGrowthRateStep(
                growthRate: step.growthRate ?? 0,
                barrierSpotDistance: step.barrierSpotDistance ?? 0,
                barrierSpotDistanceDisplay: step.barrierSpotDistanceDisplay,
                growthRateDisplay: step.growthRateDisplay,
              ))
          .where((AccumulatorGrowthRateStep step) =>
              step.growthRate > 0 && step.barrierSpotDistance > 0)
          .toList()
      ..enabled = interaction.enabled ?? false
      ..tapGuideLabel = interaction.tapGuideLabel
      ..showTapGuide = interaction.showTapGuide ?? false
      ..previewGrowthRate(interaction.previewGrowthRate);
  }

  void _applyLive(JSAccumulatorLiveBarriers? live, int? barrierDelayMs) {
    final _LiveBand? band = _LiveBand.fromPayload(live);

    if (band == null) {
      _scheduleLive(null, barrierDelayMs);
      return;
    }

    // A proposal update carries recalculated barriers and would cancel a
    // pending timer before the red barrier-hit state ever rendered, so apply
    // that one immediately.
    final bool barrierHit = band.profit == null && band.isBarrierHit;

    _scheduleLive(_buildLive(band), barrierDelayMs, immediate: barrierHit);
  }

  void _applyClosed(JSAccumulatorClosedBarriers? closed) {
    final _ClosedBand? band = _ClosedBand.fromPayload(closed);

    if (band == null) {
      _cancelClosedExpiry();
      _closedExitEpochMs = null;
      _setClosed(null);
      return;
    }

    // Retention for this contract already ran out; the host is just still
    // reporting it.
    if (band.exitEpochMs == _retiredExitEpochMs) {
      return;
    }

    if (band.exitEpochMs != _closedExitEpochMs) {
      _closedExitEpochMs = band.exitEpochMs;
      _cancelClosedExpiry();

      // No retention means keep the band indefinitely — a contract-details
      // replay exists to show exactly this finished contract.
      final int? retentionMs = band.retentionMs;
      if (retentionMs != null) {
        _closedExpiryTimer = Timer(Duration(milliseconds: retentionMs), () {
          _retiredExitEpochMs = _closedExitEpochMs;
          _closedExitEpochMs = null;
          _setClosed(null);
        });
      }
    }

    // Applied without the live band's delay: by the time a contract reports its
    // exit, the tick that ended it is already on the chart.
    _setClosed(_buildClosed(band));
  }

  AccumulatorIndicator _buildLive(_LiveBand band) => AccumulatorIndicator(
        Tick(epoch: band.spotEpochMs, quote: band.spot),
        highBarrier: band.highBarrier,
        lowBarrier: band.lowBarrier,
        highBarrierDisplay: band.highBarrierDisplay,
        lowBarrierDisplay: band.lowBarrierDisplay,
        barrierSpotDistance: band.barrierSpotDistance,
        barrierEpoch: band.barrierEpochMs,
        style: _hiddenSpotStyle,
        // Settling — sold, but the exit tick hasn't come back yet. The
        // contract's POC keeps streaming with a profit that no longer moves,
        // so the band stays and the P/L overlay goes.
        activeContract: band.isSold ? null : band.activeContract,
        controller: _controller,
      );

  AccumulatorsRecentlyClosedIndicator _buildClosed(_ClosedBand band) =>
      AccumulatorsRecentlyClosedIndicator(
        Tick(epoch: band.exitEpochMs, quote: band.exitSpot),
        highBarrier: band.highBarrier,
        lowBarrier: band.lowBarrier,
        highBarrierDisplay: band.highBarrierDisplay,
        lowBarrierDisplay: band.lowBarrierDisplay,
        barrierSpotDistance: band.barrierSpotDistance,
        barrierEpoch: band.barrierEpochMs ??
            _priorTickEpochMs(band.exitEpochMs) ??
            band.exitEpochMs,
        barrierEndEpoch: band.exitEpochMs,
        activeContract: band.activeContract,
      );

  /// Epoch (ms) of the last tick before [exitEpochMs] — the tick the exit
  /// barriers were measured against, and where the closed band starts. Used
  /// only when the host didn't supply one.
  int? _priorTickEpochMs(int exitEpochMs) {
    for (int i = _feedModel.ticks.length - 1; i >= 0; i--) {
      final int epoch = _feedModel.ticks[i].epoch;
      if (epoch < exitEpochMs) {
        return epoch;
      }
    }
    return null;
  }

  /// Applies [next] after the remaining delay, or straight away when the tick
  /// it belongs to has already rendered.
  void _scheduleLive(
    ChartAnnotation<ChartObject>? next,
    int? barrierDelayMs, {
    bool immediate = false,
  }) {
    // Cancelled before the early return, not after it. `_live` stays null for
    // the whole delay window — only the timer sets it — so a payload that
    // clears the band mid-window satisfies the guard below and would leave the
    // pending timer alive to paint a band the host had already taken away.
    _liveDelayTimer?.cancel();
    _liveDelayTimer = null;

    if (next == null && _live == null) {
      return;
    }

    if (immediate) {
      _setLive(next);
      return;
    }

    final DateTime? tickTime = _lastTickReceiveTime;
    if (tickTime != null) {
      final Duration delay =
          Duration(milliseconds: barrierDelayMs ?? _defaultBarrierDelayMs);
      final Duration remaining = delay - DateTime.now().difference(tickTime);

      if (!remaining.isNegative) {
        _liveDelayTimer = Timer(remaining, () => _setLive(next));
        return;
      }
    }

    _setLive(next);
  }

  void _setLive(ChartAnnotation<ChartObject>? next) {
    if (next == null && _live == null) {
      return;
    }
    _live = next;
    notifyListeners();
  }

  void _setClosed(ChartAnnotation<ChartObject>? next) {
    if (next == null && _closed == null) {
      return;
    }
    _closed = next;
    notifyListeners();
  }

  void _cancelClosedExpiry() {
    _closedExpiryTimer?.cancel();
    _closedExpiryTimer = null;
  }

  void _reset() {
    _liveDelayTimer?.cancel();
    _liveDelayTimer = null;
    _cancelClosedExpiry();
    _closedExitEpochMs = null;
    _retiredExitEpochMs = null;
    _controller.clearPreview();
    _setLive(null);
    _setClosed(null);
  }

  /// Clears both bands, e.g. on a symbol switch.
  void newChart() => _reset();

  @override
  void dispose() {
    _liveDelayTimer?.cancel();
    _cancelClosedExpiry();
    _feedModel.removeListener(_onFeedChanged);
    _controller.dispose();
    super.dispose();
  }
}

/// The parsed, validated form of a [JSAccumulatorLiveBarriers] payload.
class _LiveBand {
  const _LiveBand({
    required this.highBarrier,
    required this.lowBarrier,
    required this.highBarrierDisplay,
    required this.lowBarrierDisplay,
    required this.barrierSpotDistance,
    required this.barrierEpochMs,
    required this.spot,
    required this.spotEpochMs,
    required this.profit,
    required this.currency,
    required this.fractionalDigits,
    required this.isSold,
  });

  /// Returns null when the payload lacks anything needed to draw a band.
  static _LiveBand? fromPayload(JSAccumulatorLiveBarriers? payload) {
    if (payload == null) {
      return null;
    }

    final String? highBarrierDisplay = payload.highBarrier;
    final String? lowBarrierDisplay = payload.lowBarrier;
    final int? barrierEpoch = payload.barrierEpoch;
    final double? spot = payload.spot;
    final int? spotEpoch = payload.spotEpoch;

    if (highBarrierDisplay == null ||
        lowBarrierDisplay == null ||
        barrierEpoch == null ||
        spot == null ||
        spotEpoch == null) {
      return null;
    }

    final double? highBarrier = double.tryParse(highBarrierDisplay);
    final double? lowBarrier = double.tryParse(lowBarrierDisplay);

    if (highBarrier == null || lowBarrier == null) {
      return null;
    }

    return _LiveBand(
      highBarrier: highBarrier,
      lowBarrier: lowBarrier,
      highBarrierDisplay: highBarrierDisplay,
      lowBarrierDisplay: lowBarrierDisplay,
      barrierSpotDistance: payload.barrierSpotDistance ??
          _formatDistance(highBarrier - spot, highBarrierDisplay),
      barrierEpochMs: barrierEpoch * 1000,
      spot: spot,
      spotEpochMs: spotEpoch * 1000,
      profit: payload.profit,
      currency: payload.currency ?? '',
      fractionalDigits: payload.fractionalDigits ?? 2,
      isSold: payload.isSold ?? false,
    );
  }

  final double highBarrier;
  final double lowBarrier;
  final String highBarrierDisplay;
  final String lowBarrierDisplay;
  final String barrierSpotDistance;
  final int barrierEpochMs;
  final double spot;
  final int spotEpochMs;
  final double? profit;
  final String currency;
  final int fractionalDigits;
  final bool isSold;

  /// Whether the spot has left the band — what turns the barriers red.
  bool get isBarrierHit => spot > highBarrier || spot < lowBarrier;

  /// The P/L overlay, or null for a pre-trade proposal.
  AccumulatorsActiveContract? get activeContract => profit == null
      ? null
      : AccumulatorsActiveContract(
          profit: profit,
          profitUnit: currency,
          fractionalDigits: fractionalDigits,
        );
}

/// The parsed, validated form of a [JSAccumulatorClosedBarriers] payload.
class _ClosedBand {
  const _ClosedBand({
    required this.highBarrier,
    required this.lowBarrier,
    required this.highBarrierDisplay,
    required this.lowBarrierDisplay,
    required this.barrierSpotDistance,
    required this.barrierEpochMs,
    required this.exitSpot,
    required this.exitEpochMs,
    required this.profit,
    required this.currency,
    required this.fractionalDigits,
    required this.retentionMs,
  });

  /// Returns null when the payload lacks anything needed to draw a band.
  static _ClosedBand? fromPayload(JSAccumulatorClosedBarriers? payload) {
    if (payload == null) {
      return null;
    }

    final String? highBarrierDisplay = payload.highBarrier;
    final String? lowBarrierDisplay = payload.lowBarrier;
    final double? exitSpot = payload.exitSpot;
    final int? exitEpoch = payload.exitEpoch;

    if (highBarrierDisplay == null ||
        lowBarrierDisplay == null ||
        exitSpot == null ||
        exitEpoch == null) {
      return null;
    }

    final double? highBarrier = double.tryParse(highBarrierDisplay);
    final double? lowBarrier = double.tryParse(lowBarrierDisplay);

    if (highBarrier == null || lowBarrier == null) {
      return null;
    }

    final int? barrierEpoch = payload.barrierEpoch;

    return _ClosedBand(
      highBarrier: highBarrier,
      lowBarrier: lowBarrier,
      highBarrierDisplay: highBarrierDisplay,
      lowBarrierDisplay: lowBarrierDisplay,
      barrierSpotDistance: payload.barrierSpotDistance ??
          _formatDistance(highBarrier - exitSpot, highBarrierDisplay),
      barrierEpochMs: barrierEpoch == null ? null : barrierEpoch * 1000,
      exitSpot: exitSpot,
      exitEpochMs: exitEpoch * 1000,
      profit: payload.profit,
      currency: payload.currency ?? '',
      fractionalDigits: payload.fractionalDigits ?? 2,
      retentionMs: payload.retentionMs,
    );
  }

  final double highBarrier;
  final double lowBarrier;
  final String highBarrierDisplay;
  final String lowBarrierDisplay;
  final String barrierSpotDistance;
  final int? barrierEpochMs;
  final double exitSpot;
  final int exitEpochMs;
  final double? profit;
  final String currency;
  final int fractionalDigits;

  /// How long this band is kept before being retired. Null keeps it forever.
  final int? retentionMs;

  /// The final P/L overlay, or null when the contract reported no profit.
  AccumulatorsActiveContract? get activeContract => profit == null
      ? null
      : AccumulatorsActiveContract(
          profit: profit,
          profitUnit: currency,
          fractionalDigits: fractionalDigits,
        );
}

/// Rounds [distance] to the decimals [barrierDisplay] is quoted with.
String _formatDistance(double distance, String barrierDisplay) {
  final int dot = barrierDisplay.indexOf('.');
  final int precision = dot >= 0 ? barrierDisplay.length - dot - 1 : 0;
  return distance.abs().toStringAsFixed(precision);
}
