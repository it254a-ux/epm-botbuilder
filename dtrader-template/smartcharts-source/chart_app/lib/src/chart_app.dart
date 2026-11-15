import 'dart:async';
import 'dart:math';

import 'package:chart_app/src/interop/js_interop.dart';
import 'package:chart_app/src/misc/wrapped_controller.dart';
import 'package:chart_app/src/models/accumulator_barriers.dart';
import 'package:chart_app/src/models/chart_config.dart';
import 'package:chart_app/src/models/chart_feed.dart';
import 'package:chart_app/src/models/drawing_tool.dart';
import 'package:chart_app/src/models/indicators.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';

/// ChartApp
class ChartApp {
  /// Constructor
  ChartApp(
    this.configModel,
    this.feedModel,
    this.indicatorsModel,
    this.drawingToolModel,
    this.accumulatorBarriersModel,
  ) {
    // [yAxisWidth] and [currentTickWidth] are derived from the config's theme,
    // pip size and last-digit emphasis, but [calculateTickWidth] is otherwise
    // only reached from the `ValueListenableBuilder` on
    // `feedModel.feedLoadedNotifier`, which flips on feed reloads alone.
    // A config-only change — `updateTheme`, `updateLastDigitEmphasis` —
    // repaints the chart through [ChartConfigModel]'s own listeners further
    // down the tree without rebuilding that builder, so both widths would
    // otherwise keep describing the previous config until the next feed load.
    //
    // No matching `removeListener`: this and [configModel] are both created
    // once in `_DerivChartWebAdapterState` and share the app's lifetime.
    configModel.addListener(calculateTickWidth);
  }

  /// ChartConfigModel
  ChartConfigModel configModel;

  /// ChartFeedModel
  ChartFeedModel feedModel;

  /// Indicators config
  IndicatorsModel indicatorsModel;

  /// drawingtool config
  DrawingToolModel drawingToolModel;

  /// Accumulators barrier band
  AccumulatorBarriersModel accumulatorBarriersModel;

  /// WrappedController
  WrappedController wrappedController = WrappedController();

  bool _prevShowChart = false;

  /// Monotonic counter bumped on every [newChart]. A `newChart` coroutine
  /// captures its generation before awaiting [chartReady]; if a later
  /// `newChart` has since superseded it, the stale coroutine bails out instead
  /// of loading drawings for an outdated payload/symbol.
  int _chartGeneration = 0;

  /// height of xAxis
  double xAxisHeight = 24;

  /// width of yAxis
  double yAxisWidth = 60;

  /// width of current tick label
  double currentTickWidth = 60;

  /// Whether chart is mounted or not.
  bool isMounted = false;

  /// Completes once the chart is mounted (feed loaded + first frame painted).
  /// Awaiting [chartReady] is the proper signal for any operation that needs
  /// the price-axis coordinate system / render surface to exist — e.g. loading
  /// saved drawing tools. Reset on every [newChart] so symbol switches re-arm.
  Completer<void> _chartReadyCompleter = Completer<void>();

  /// Future that resolves when the chart is ready to accept render-dependent ops.
  Future<void> get chartReady => _chartReadyCompleter.future;

  void _processChartVisibilityChange(bool showChart) {
    if (showChart) {
      /// To prevent controller functions being called before mount.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        isMounted = true;
        if (!_chartReadyCompleter.isCompleted) {
          _chartReadyCompleter.complete();
        }
      });
    } else {
      isMounted = false;
    }
  }

  /// Gets the chart visibility
  bool getChartVisibilitity() {
    final bool showChart = feedModel.isFeedLoaded;

    if (showChart != _prevShowChart) {
      _processChartVisibilityChange(showChart);
    }

    _prevShowChart = showChart;
    return showChart;
  }

  /// Initialize new chart
  Future<void> newChart(JSNewChart payload) async {
    final int generation = ++_chartGeneration;

    // Re-arm the readiness gate for the new chart instance. The previous
    // completer may already have fired for an earlier chart; we want a fresh
    // one that completes when THIS chart's first frame is painted.
    //
    // We deliberately only swap in a fresh completer when the previous one has
    // already completed. If a prior `newChart` is still pending (rapid symbol
    // switch, or a feed-load that never arrived because JS threw between its
    // paired `app.newChart` / `feed.onTickHistory` calls), it is suspended on
    // THIS completer instance — replacing it would orphan that coroutine on a
    // future that can never complete, hanging it forever. By sharing the
    // completer, the pending call resolves alongside this one when the chart
    // mounts; the `generation` guard below then ensures only the latest
    // `newChart` actually loads drawings.
    if (_chartReadyCompleter.isCompleted) {
      _chartReadyCompleter = Completer<void>();
    }

    // Force the next visibility-change detection in [getChartVisibilitity] to
    // fire. On symbol switch the JS side calls `app.newChart` and
    // `feed.onTickHistory` back-to-back, so `feedLoadedNotifier` flips
    // false → true within the same microtask batch — no frame ever renders
    // with showChart=false. Without resetting this, the next frame would see
    // showChart unchanged (true → true), skip [_processChartVisibilityChange]
    // entirely, and [_chartReadyCompleter] would hang forever — leaving the
    // previous symbol's drawings stuck in the InteractiveLayer's local state.
    _prevShowChart = false;

    configModel.newChart(payload);
    drawingToolModel.newChart(payload);
    feedModel.newChart();
    // The band belongs to the outgoing symbol's contract; leaving it up would
    // draw stale barriers over the new symbol's prices.
    accumulatorBarriersModel.newChart();

    // Defer drawing-tool load until the chart's render surface and feed are
    // live.
    await chartReady;

    // A newer newChart() superseded this one while we were awaiting readiness
    // (e.g. the user switched symbol again, or navigated to the contract-details
    // chart which mounts with a different payload). Bail so we don't load this
    // payload's drawings on top of — or against the symbol of — the newer chart.
    if (generation != _chartGeneration) {
      return;
    }

    // Contract-details charts mount with `startWithDataFitMode=true` and
    // position themselves through data-fit, so neither the viewport nudge nor
    // the drawing-tools load below applies to them. They are also wired to the
    // empty drawing-tools repo in `deriv_chart_wrapper`, so they must never
    // have anything render.
    if (!payload.startWithDataFitMode) {
      _pullViewportOntoData();
      await drawingToolModel.loadAndNotifyDrawings();
    }
  }

  /// Re-runs `scrollToLastTick` once the chart has actually consumed the new
  /// feed, so the visible area lands on the incoming symbol's data.
  ///
  /// `XAxisModel` refreshes its entries and epoch bounds only from
  /// `didUpdateWidget` — one frame after `feed.onTickHistory` lands. The
  /// `scrollToLastTick()` that `ChartStore.newChart` fires synchronously right
  /// after `onTickHistory` therefore still sees the *previous* symbol's
  /// entries, so it resolves against stale data and leaves the viewport where
  /// the outgoing symbol had it.
  ///
  /// For a live symbol that is invisible: both symbols' newest ticks are
  /// ~`now`, so the parked viewport is already correct, and the next tick
  /// re-clamps it regardless. A closed symbol has no next tick and its newest
  /// tick can be days old, so the viewport stays parked near `now` with no data
  /// in range — and with nothing left to trigger a repaint, the chart reads as
  /// blank until the user scrolls or zooms.
  ///
  /// Callers must await [chartReady] first: it completes in the post-frame
  /// callback of the frame that ran `didUpdateWidget`, which is the earliest
  /// point at which this resolves against the correct entries.
  void _pullViewportOntoData() {
    if (feedModel.ticks.isEmpty) {
      return;
    }

    wrappedController.scrollToLastTick();
  }

  /// Calculates the width of yAxis and sets the height of xAxis
  void calculateTickWidth() {
    yAxisWidth = calculateYAxisWidth(
      feedModel.ticks,
      configModel.theme,
      configModel.pipSize,
    );
    xAxisHeight = configModel.theme.gridStyle.xLabelsAreaHeight;

    currentTickWidth = calculateCurrentTickWidth(
      feedModel.ticks,
      const TextStyle(
        fontSize: 12,
        height: 1.3,
        fontWeight: FontWeight.w600,
        color: Colors.white,
        fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
      ),
      configModel.pipSize,
      // Kept in step with the label the barrier painter actually draws: an
      // emphasised last digit is wider than the rest of the price, and the
      // HTML price lines size themselves from this value.
      lastDigitTextStyle: configModel.shouldEmphasizeLastDigit
          ? configModel.theme.currentSpotLastDigitTextStyle
          : null,
    );
  }

  /// Gets the tooltip content for indicator series
  List<JsIndicatorTooltip?>? getTooltipContent(int epoch, int pipSize) {
    final List<Series> seriesList =
        wrappedController.getSeriesList() ?? <Series>[];
    final List<IndicatorConfig> indicatorConfigsList =
        wrappedController.getConfigsList() as List<IndicatorConfig>? ??
            <IndicatorConfig>[];

    return indicatorsModel.getTooltipContent(
      seriesList,
      indicatorConfigsList,
      epoch,
      pipSize,
    );
  }

  /// Gets the quote interval as granularity to fix 2s ticks.
  int getQuotesInterval() {
    final int granularity = configModel.granularity ?? 1000;

    // The current charts expect the granularity of the ticks.
    // Sometimes the feed misses a tick and the chart zoom
    // doesn't work properly.
    // The 2 tick symbols are hard coded here to fix the scaling issue.
    // To do: Make flutter chart independent of the granularity.
    // Flutter chart should do the x-axis calculations from the first epoch
    // and last epoch.
    final RegExp regex = RegExp(r'^(RDBEAR|RDBULL|R_)');

    if (granularity == 1000 && regex.hasMatch(configModel.symbol)) {
      return 2000;
    }

    return granularity;
  }

  /// Gets the hover index for indicator series
  int? getIndicatorHoverIndex(double x, double y, Function getClosestEpoch,
      int granularity, int bottomIndicatorIndex) {
    final List<Series> seriesList =
        wrappedController.getChartController().getSeriesList?.call() ??
            <Series>[];
    final List<IndicatorConfig> indicatorConfigsList =
        wrappedController.getChartController().getConfigsList != null
            ? wrappedController.getChartController().getConfigsList!.call()
                as List<IndicatorConfig>
            : <IndicatorConfig>[];

    final int? value = indicatorsModel.getIndicatorHoverIndex(
      seriesList,
      indicatorConfigsList,
      wrappedController,
      getClosestEpoch,
      granularity,
      x,
      y,
      bottomIndicatorIndex,
    );

    return value;
  }

  /// To add or update an indicator
  void addOrUpdateIndicator(String dataString, int? index) {
    indicatorsModel.addOrUpdateIndicator(dataString, index);

    // A hack to fix the indicator style not being
    // updated when the chart is not moved.
    // TO DO: Add a proper fix
    final Random random = Random();
    final int randomNumber = random.nextInt(100);
    wrappedController.scroll(randomNumber >= 50 ? 0.2 : -0.2);
  }
}
