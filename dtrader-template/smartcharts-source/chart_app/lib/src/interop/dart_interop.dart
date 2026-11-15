import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'dart:js_interop_unsafe';

import 'package:chart_app/src/chart_app.dart';
import 'package:chart_app/src/misc/crosshair_controller.dart';
import 'package:chart_app/src/models/indicators.dart';
import 'package:chart_app/src/models/accumulator_barriers.dart';
import 'package:chart_app/src/models/drawing_tool.dart';
import 'package:chart_app/src/models/chart_config.dart';
import 'package:chart_app/src/models/chart_feed.dart';
import 'package:chart_app/src/interop/js_interop.dart';

/// Wrapper classes for JS interop using JSExport
/// These wrappers expose Dart functionality to JavaScript using JSExport.
/// All method signatures have been verified to match the original implementations.

@JSExport()
class AppWrapper {
  final ChartApp _app;

  AppWrapper(this._app);

  double getXAxisHeight() => _app.xAxisHeight;
  double getYAxisWidth() => _app.yAxisWidth;
  double getCurrentTickWidth() => _app.currentTickWidth;
  // ChartApp.newChart is async (it awaits chart-ready before loading
  // saved drawings), but the JS bridge stays fire-and-forget — JS does not
  // await it. unawaited() makes that explicit for the analyzer.
  void newChart(JSNewChart payload) => unawaited(_app.newChart(payload));
  List<dynamic>? getTooltipContent(int epoch, int pipSize) =>
      _app.getTooltipContent(epoch, pipSize);
  int? getIndicatorHoverIndex(double x, double y, Function getClosestEpoch,
          int granularity, int bottomIndicatorIndex) =>
      _app.getIndicatorHoverIndex(
          x, y, getClosestEpoch, granularity, bottomIndicatorIndex);

  // Wrapped controller methods
  double? getXFromEpoch(int epoch) =>
      _app.wrappedController.getXFromEpoch(epoch);
  double? getYFromQuote(double quote) =>
      _app.wrappedController.getYFromQuote(quote);
  int? getEpochFromX(double x) => _app.wrappedController.getEpochFromX(x);
  double? getQuoteFromY(double y) => _app.wrappedController.getQuoteFromY(y);
  double? scale(double factor) => _app.wrappedController.scale(factor);
  void scroll(double dx) => _app.wrappedController.scroll(dx);
  void scrollToLastTick() => _app.wrappedController.scrollToLastTick();
  void toggleXScrollBlock(bool isXScrollBlocked) =>
      _app.wrappedController.toggleXScrollBlock(isXScrollBlocked);
  void toggleDataFitMode(bool dataFitMode) =>
      _app.wrappedController.toggleDataFitMode(dataFitMode);
  void addOrUpdateIndicator(String dataString, int? index) =>
      _app.addOrUpdateIndicator(dataString, index);
}

@JSExport()
class CrosshairWrapper {
  final CrosshairController _controller;

  CrosshairWrapper(this._controller);

  double? getXFromEpoch(int epoch) => _controller.getXFromEpoch(epoch);
  double? getYFromQuote(double quote) => _controller.getYFromQuote(quote);
  int? getEpochFromX(double x) => _controller.getEpochFromX(x);
  double? getQuoteFromY(double y) => _controller.getQuoteFromY(y);
}

@JSExport()
class ChartFeedWrapper {
  final ChartFeedModel _model;

  ChartFeedWrapper(this._model);

  void onTickHistory(JSAny data, bool isReset) {
    final List<JsQuote> quotes = (data as JSArray<JSAny>)
        .toDart
        .whereType<JSAny>()
        .map((JSAny item) => item as JsQuote)
        .toList();
    _model.onTickHistory(quotes, isReset);
  }

  void onNewTick(JSAny data) => _model.onNewTick(data as JsQuote);
  void onNewCandle(JSAny data) => _model.onNewCandle(data as JsQuote);
}

@JSExport()
class ChartConfigWrapper {
  final ChartConfigModel _model;
  final AccumulatorBarriersModel _accumulatorBarriers;

  ChartConfigWrapper(this._model, this._accumulatorBarriers);

  /// Sets the Accumulators barrier band. Pass `null` to clear it.
  void updateAccumulatorBarriers(JSAny? barriers) =>
      _accumulatorBarriers.updateBarriers(
        barriers == null ? null : barriers as JSAccumulatorBarriers,
      );

  void updateTheme(String theme) => _model.updateTheme(theme);
  void newChart(JSNewChart chartConfig) => _model.newChart(chartConfig);
  void updateChartStyle(String style) => _model.updateChartStyle(style);
  void updateAreaStyle(String? color, double? thickness, bool? hasGradient) =>
      _model.updateAreaStyle(
        color: color,
        thickness: thickness,
        hasGradient: hasGradient,
      );
  void setRemainingTime(String time) => _model.setRemainingTime(time);
  void updateContracts(JSAny contracts) {
    final List<JSContractsUpdate> contractsList = (contracts as JSArray<JSAny>)
        .toDart
        .whereType<JSAny>()
        .map((JSAny c) => c as JSContractsUpdate)
        .toList();
    _model.updateContracts(contractsList);
  }

  void updateLiveStatus(bool isLive) => _model.updateLiveStatus(isLive);
  void updateLastDigitEmphasis(bool shouldEmphasize) =>
      _model.updateLastDigitEmphasis(shouldEmphasize);
  void updateVerticalPaddingFraction(double? fraction) =>
      _model.updateVerticalPaddingFraction(fraction);
  void updateCrosshairVisibility(bool visible) =>
      _model.updateCrosshairVisibility(visible);
  void updateLeftMargin(double? margin) {
    if (margin != null) _model.updateLeftMargin(margin);
  }

  void updateRightPadding(int? padding) {
    if (padding != null) _model.updateRightPadding(padding);
  }

  void toggleTimeIntervalVisibility(bool visible) =>
      _model.toggleTimeIntervalVisibility(visible);
  void setSymbolClosed(bool closed) => _model.setSymbolClosed(closed);
}

@JSExport()
class IndicatorsWrapper {
  final IndicatorsModel _model;

  IndicatorsWrapper(this._model);

  void removeIndicator(int indicatorId) => _model.removeIndicator(indicatorId);
  void clearIndicators() => _model.clearIndicators();
}

@JSExport()
class DrawingToolWrapper {
  final DrawingToolModel _model;

  DrawingToolWrapper(this._model);

  void updateFloatingMenuPosition(double x, double y) =>
      _model.updateFloatingMenuPosition(x, y);
  void startAddingNewTool(String toolType) =>
      _model.startAddingNewTool(toolType);
  void cancelAddingNewTool() => _model.cancelAddingNewTool();
  void removeDrawingTool(int index) => _model.removeDrawingTool(index);
  void clearDrawingToolSelect() => _model.clearDrawingToolSelect();
  void clearDrawingTool() => _model.clearDrawingTool();
  List<String> getDrawingToolsRepoItems() => _model.getDrawingToolsRepoItems();
}

/// Initialize the JavaScript interop
void initDartInterop(ChartApp app) {
  final AppWrapper appWrapper = AppWrapper(app);
  final CrosshairWrapper crosshairWrapper =
      CrosshairWrapper(app.wrappedController.getCrosshairController());
  final ChartFeedWrapper feedWrapper = ChartFeedWrapper(app.feedModel);
  final ChartConfigWrapper configWrapper =
      ChartConfigWrapper(app.configModel, app.accumulatorBarriersModel);
  final IndicatorsWrapper indicatorsWrapper =
      IndicatorsWrapper(app.indicatorsModel);
  final DrawingToolWrapper drawingToolWrapper =
      DrawingToolWrapper(app.drawingToolModel);

  final JSObject dartInterop = JSObject()
    ..setProperty('app'.toJS, createJSInteropWrapper(appWrapper))
    ..setProperty('crosshair'.toJS, createJSInteropWrapper(crosshairWrapper))
    ..setProperty('feed'.toJS, createJSInteropWrapper(feedWrapper))
    ..setProperty('config'.toJS, createJSInteropWrapper(configWrapper))
    ..setProperty('indicators'.toJS, createJSInteropWrapper(indicatorsWrapper))
    ..setProperty(
        'drawingTool'.toJS, createJSInteropWrapper(drawingToolWrapper));

  web.window.setProperty('flutterChart'.toJS, dartInterop);
}
