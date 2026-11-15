import 'dart:collection';
import 'dart:math';

import 'package:chart_app/src/chart_app.dart';
import 'package:chart_app/src/helpers/marker_painter.dart';
import 'package:chart_app/src/helpers/series.dart';
import 'package:chart_app/src/interop/js_interop.dart';
import 'package:chart_app/src/models/accumulator_barriers.dart';
import 'package:chart_app/src/models/chart_config.dart';
import 'package:chart_app/src/models/chart_feed.dart';
import 'package:chart_app/src/models/drawing_tool.dart';
import 'package:chart_app/src/misc/quill_chart_icons.dart';
import 'package:chart_app/src/models/indicators.dart';
import 'package:chart_app/src/series/blink_tick_indicator.dart';
import 'package:chart_app/src/series/current_tick_indicator.dart';
import 'package:chart_app/src/series/time_interval_indicator.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
// Use the web package instead of dart:html for WASM compatibility
import 'package:web/web.dart' as web;

/// DerivChartWrapper
class DerivChartWrapper extends StatefulWidget {
  /// Initialize
  const DerivChartWrapper({
    required this.app,
    required this.onVisibleAreaChanged,
    Key? key,
  }) : super(key: key);

  /// ChartApp
  final ChartApp app;

  /// Called when chart is scrolled or zoomed.
  final VisibleAreaChangedCallback onVisibleAreaChanged;

  @override
  State<DerivChartWrapper> createState() => DerivChartWrapperState();
}

/// DerivChartWrapperState
class DerivChartWrapperState extends State<DerivChartWrapper> {
  /// Initialize
  DerivChartWrapperState() {
    _useLowAnimation = _shouldUseLowAnimation();
  }

  /// Epochs
  int? leftBoundEpoch, rightBoundEpoch;

  /// App
  ChartApp get app => widget.app;

  /// ConfigModel
  ChartConfigModel get configModel => widget.app.configModel;

  /// IndicatorsModel
  IndicatorsModel get indicatorsModel => widget.app.indicatorsModel;

  /// ChartFeedModel
  ChartFeedModel get feedModel => widget.app.feedModel;

  /// DrawingToolModel
  DrawingToolModel get drawingToolModel => widget.app.drawingToolModel;

  /// AccumulatorBarriersModel
  AccumulatorBarriersModel get accumulatorBarriersModel =>
      widget.app.accumulatorBarriersModel;

  bool _useLowAnimation = false;

  final EdgeInsets _minFitPadding = const EdgeInsets.only(left: 16, right: 120);

  @override
  void initState() {
    super.initState();
  }

  bool _shouldUseLowAnimation() {
    final String userAgent = web.window.navigator.userAgent;

    final List<String> devices = <String>[
      'Android',
      'iPhone',
      'iPad',
      'Mac',
      'Windows'
    ];

    return !devices.any((String device) => userAgent.contains(device));
  }

  double? _getVerticalPaddingFraction(double height) {
    // An explicit zoom from the host wins: `yAxisMargin` exists to reserve room
    // for chrome overlapping the chart, and its derived fraction bottoms out at
    // 0.1, well short of how far in the chart itself can go.
    if (configModel.verticalPaddingFraction != null) {
      return configModel.verticalPaddingFraction;
    }

    if (configModel.yAxisMargin != null && height != 0) {
      // We are converting yAxisMargin to verticalPaddingFraction to make it
      // compatible with ChartIQ.
      // TO DO: Do a proper fix once ChartIQ is removed
      final double multiplier = configModel.startWithDataFitMode ? 1.5 : 1.25;
      final double verticalPaddingFraction = (max(
                  configModel.yAxisMargin!.top ?? 0,
                  configModel.yAxisMargin!.bottom ?? 0) *
              multiplier) /
          height;

      return verticalPaddingFraction.clamp(0.1, 0.45);
    }
    return null;
  }

  double _getMaxCurrentTickOffset(int? rightPadding) {
    final double currentTickOffset =
        configModel.startWithDataFitMode ? 150 : 300;
    return configModel.isMobile
        ? currentTickOffset / 1.25
        : currentTickOffset + (rightPadding ?? 0);
  }

  double _getMinIntervalWidth() {
    if (configModel.startWithDataFitMode &&
        configModel.style == ChartStyle.line) {
      return 0.1;
    }
    return 1;
  }

  double _getMaxIntervalWidth() {
    if (configModel.startWithDataFitMode &&
        configModel.style == ChartStyle.line &&
        feedModel.ticks.length <= 10) {
      return 160;
    }
    return 80;
  }

  double? _getDefaultTickOffset(int? rightPadding, bool isTickGranularity) {
    // Only apply this offset for mobile view with non-tick granularity
    if (!configModel.isMobile || isTickGranularity) {
      return null;
    }
    // Return half of max offset as default offset
    return _getMaxCurrentTickOffset(rightPadding) / 2;
  }

  Duration _getAnimationDuration({required bool isTickGranularity}) {
    if (!isTickGranularity) {
      return const Duration(milliseconds: 30);
    }

    final int visibleEpoch = (rightBoundEpoch ?? 0) - (leftBoundEpoch ?? 0);
    // 15 mins
    const int minEpochToScrollSmooth = 15 * 60 * 1000;

    if (visibleEpoch > minEpochToScrollSmooth ||
        indicatorsModel.indicatorsRepo.items.length >= 2) {
      return const Duration(milliseconds: 30);
    }

    if (_useLowAnimation) {
      return const Duration(milliseconds: 100);
    }

    return const Duration(milliseconds: 250);
  }

  int? _getRightPadding(bool isTickGranularity, int granularity, double width) {
    if (configModel.rightPadding != null && configModel.rightPadding! > 0) {
      return configModel.rightPadding!;
    }

    if (isTickGranularity &&
        configModel.startWithDataFitMode &&
        configModel.style == ChartStyle.line &&
        feedModel.ticks.length <= 10) {
      final int msDataDuration = feedModel.ticks.length * granularity;
      final double pxTargetDataWidth = width - _minFitPadding.horizontal;

      final double _minMsPerPx = granularity / _getMaxIntervalWidth();
      final double _maxMsPerPx = granularity / _getMinIntervalWidth();
      final double msPerPx = msDataDuration / pxTargetDataWidth;
      final double clampedMsPerPx = msPerPx.clamp(_minMsPerPx, _maxMsPerPx);

      if (msPerPx >= clampedMsPerPx) {
        final int extraRightPadding = granularity ~/ (clampedMsPerPx * 2);
        return extraRightPadding;
      }

      final double msPerPxDiff = clampedMsPerPx - msPerPx;

      /// Added one granularity because tick_history will have one extra tick
      /// to indicate the start
      final int extraRightPadding =
          (msPerPxDiff * pxTargetDataWidth + granularity) ~/
              (clampedMsPerPx * 2);

      return extraRightPadding;
    }
    return null;
  }

  EdgeInsets? _getDataFitPadding(int? rightPadding) {
    if (rightPadding != null && rightPadding > 0) {
      return EdgeInsets.only(
        left: _minFitPadding.left,
        right: _minFitPadding.right + rightPadding,
      );
    }
    return null;
  }

  @override
  Widget build(BuildContext context) => MultiProvider(
        providers: <ChangeNotifierProvider<ChangeNotifier>>[
          ChangeNotifierProvider<ChartConfigModel>.value(value: configModel),
          ChangeNotifierProvider<ChartFeedModel>.value(value: feedModel),
          ChangeNotifierProvider<AccumulatorBarriersModel>.value(
              value: accumulatorBarriersModel),
        ],
        child: Scaffold(
          body: LayoutBuilder(
            builder: (BuildContext _, BoxConstraints constraints) => Center(
              child: Column(
                children: <Widget>[
                  Expanded(child: Consumer3<ChartConfigModel, ChartFeedModel,
                          AccumulatorBarriersModel>(
                      builder: (BuildContext context,
                          ChartConfigModel configModel,
                          ChartFeedModel feedModel,
                          AccumulatorBarriersModel accumulatorBarriersModel,
                          Widget? child) {
                    final int granularity = app.getQuotesInterval();

                    final bool isTickGranularity = granularity < 60000;

                    final bool isLightMode =
                        configModel.theme is ChartDefaultLightTheme;

                    final DataSeries<Tick> mainSeries =
                        getDataSeries(feedModel, configModel, granularity);

                    final Color latestTickColor = isLightMode
                        ? Color.fromRGBO(
                            0, 0, 0, configModel.isSymbolClosed ? 0.32 : 1)
                        : Color.fromRGBO(255, 255, 255,
                            configModel.isSymbolClosed ? 0.32 : 1);

                    final Duration? animationDuration = configModel
                            .isSmoothChartEnabled
                        ? null // Uses flutter-chart default 300ms for smooth animations
                        : _getAnimationDuration(
                            isTickGranularity: isTickGranularity);

                    final int? rightPadding = _getRightPadding(
                        isTickGranularity, granularity, constraints.maxWidth);

                    drawingToolModel.updateInteractiveLayerBehaviour(
                        configModel.isMobile
                            ? InteractiveLayerMobileBehaviour()
                            : InteractiveLayerDesktopBehaviour());

                    return DerivChart(
                      // Force a full remount when toggling between live (trade)
                      // and data-fit (contract-details replay) modes. Without
                      // a key flip, DerivChart and its `InteractiveLayer` child
                      // would just rebuild with new props, but `InteractiveLayer`
                      // has no `didUpdateWidget` for `drawingToolsRepo`, so its
                      // listener stays bound to the previous repo and its
                      // `_interactableDrawings` State map keeps the previous
                      // chart's drawings. Re-keying discards that State.
                      key: ValueKey<bool>(configModel.startWithDataFitMode),
                      activeSymbol: configModel.symbol,
                      mainSeries: mainSeries,
                      annotations: feedModel.ticks.isNotEmpty
                          ? <ChartAnnotation<ChartObject>>[
                              if (configModel.isLive)
                                CurrentTickIndicator(
                                  feedModel.ticks.last,
                                  id: 'last_tick_indicator',
                                  // Only the current spot takes the emphasised
                                  // variant: the blinking dot and the interval
                                  // countdown below share `currentSpotStyle`
                                  // but paint no price of their own.
                                  style: (configModel.shouldEmphasizeLastDigit
                                          ? configModel.theme
                                              .currentSpotWithEmphasizedLastDigitStyle
                                          : configModel.theme.currentSpotStyle)
                                      .copyWith(
                                    labelPadding: 8,
                                    hasArrow: false,
                                  ),
                                  visibility: HorizontalBarrierVisibility
                                      .keepBarrierLabelVisible,
                                ),
                              if (configModel.isLive)
                                BlinkingTickIndicator(feedModel.ticks.last,
                                    id: 'blink_tick_indicator',
                                    visibility: HorizontalBarrierVisibility
                                        .keepBarrierLabelVisible,
                                    style: configModel.theme.currentSpotStyle),
                              if (app.configModel.showTimeInterval &&
                                  !isTickGranularity)
                                TimeIntervalIndicator(
                                  app.configModel.remainingTime,
                                  feedModel.ticks.last.close,
                                  longLine: false,
                                  style: configModel.theme.currentSpotStyle
                                      .copyWith(
                                    hasArrow: false,
                                  ),
                                ),
                              // Accumulators bands — the live one, plus the
                              // frozen band of a contract that just finished.
                              // Each keeps itself in the Y-axis range through
                              // its own `recalculateMinMax`, so the barriers
                              // never leave the viewport.
                              ...accumulatorBarriersModel.annotations,
                            ]
                          : null,
                      pipSize: configModel.pipSize,
                      granularity: granularity,
                      controller: app.wrappedController.getChartController(),
                      theme: configModel.theme,
                      onVisibleAreaChanged: (int leftEpoch, int rightEpoch) {
                        if (!feedModel.waitingForHistory &&
                            feedModel.ticks.isNotEmpty &&
                            leftEpoch < feedModel.ticks.first.epoch) {
                          feedModel.loadHistory(1000);
                        }
                        leftBoundEpoch = leftEpoch;
                        rightBoundEpoch = rightEpoch;
                        widget.onVisibleAreaChanged(leftEpoch, rightEpoch);
                        JsInterop.onVisibleAreaChanged(leftEpoch, rightEpoch);
                      },
                      onQuoteAreaChanged:
                          (double topQuote, double bottomQuote) {
                        JsInterop.onQuoteAreaChanged(topQuote, bottomQuote);
                      },
                      markerSeries: MarkerGroupSeries(
                        SplayTreeSet<Marker>(),
                        markerGroupList: configModel.markerGroupList,
                        markerGroupIconPainter: getMarkerGroupPainter(app),
                      ),
                      // Replay charts get an always-empty drawing-tools repo
                      // so the `InteractiveLayer` has nothing to render. Per-
                      // symbol persistence in SharedPreferences is untouched —
                      // when the user returns to the trade chart, the live
                      // repo reloads via `loadAndNotifyDrawings`.
                      drawingToolsRepo: configModel.startWithDataFitMode
                          ? drawingToolModel.emptyDrawingToolsRepo
                          : drawingToolModel.drawingToolsRepo,
                      drawingTools: drawingToolModel.drawingTools,
                      indicatorsRepo: indicatorsModel.indicatorsRepo,
                      // Without this the on-chart indicator labels fall back to
                      // Material glyphs, which don't match the quill icons the
                      // surrounding chart UI uses.
                      indicatorLabelIcons: QuillChartIcons.labelIcons,
                      dataFitEnabled: configModel.startWithDataFitMode,
                      useDrawingToolsV2: true,
                      interactiveLayerBehaviour:
                          drawingToolModel.interactiveLayerBehaviour,
                      showCrosshair: configModel.showCrosshair,
                      crosshairVariant: configModel.isMobile
                          ? CrosshairVariant.smallScreen
                          : CrosshairVariant.largeScreen,
                      isLive: configModel.isLive,
                      chartAxisConfig: ChartAxisConfig(
                          defaultTickOffset: _getDefaultTickOffset(
                              rightPadding, isTickGranularity),
                          maxCurrentTickOffset:
                              _getMaxCurrentTickOffset(rightPadding),
                          smoothScrolling: configModel.isSmoothChartEnabled),
                      msPerPx: configModel.startWithDataFitMode
                          ? null
                          : configModel.msPerPx,
                      minIntervalWidth: _getMinIntervalWidth(),
                      maxIntervalWidth: _getMaxIntervalWidth(),
                      dataFitPadding: _getDataFitPadding(rightPadding),
                      bottomChartTitleMargin: configModel.leftMargin != null
                          ? EdgeInsets.only(left: configModel.leftMargin!)
                          : null,
                      verticalPaddingFraction:
                          _getVerticalPaddingFraction(constraints.maxHeight),
                      showDataFitButton: false,
                      showScrollToLastTickButton: false,
                      loadingAnimationColor: Colors.transparent,
                      showCurrentTickBlinkAnimation: false,
                      currentTickAnimationDuration: animationDuration,
                      quoteBoundsAnimationDuration: animationDuration,
                    );
                  }))
                ],
              ),
            ),
          ),
        ),
      );
}
