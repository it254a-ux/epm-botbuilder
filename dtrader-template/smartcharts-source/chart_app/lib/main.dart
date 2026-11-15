import 'dart:async';
import 'dart:js_interop';
import 'package:chart_app/deriv_chart_wrapper.dart';
import 'package:chart_app/src/chart_app.dart';
import 'package:chart_app/src/helpers/color.dart';
import 'package:chart_app/src/misc/no_navigation_strategy.dart';
import 'package:chart_app/src/models/drawing_tool.dart';
import 'package:chart_app/src/models/indicators.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'package:web/web.dart' as web;

import 'src/models/accumulator_barriers.dart';
import 'src/models/chart_feed.dart';
import 'src/models/chart_config.dart';
import 'src/interop/dart_interop.dart';
import 'src/interop/js_interop.dart';

void main() {
  setUrlStrategy(NoNavigationStrategy());
  runApp(const DerivChartApp());
}

/// The start of the application.
class DerivChartApp extends StatelessWidget {
  /// Initialize
  const DerivChartApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(fontFamily: 'IBMPlexSans'),
        home: const _DerivChartWebAdapter(),
        title: web.document.title,
      );
}

class _DerivChartWebAdapter extends StatefulWidget {
  const _DerivChartWebAdapter({Key? key}) : super(key: key);

  @override
  State<_DerivChartWebAdapter> createState() => _DerivChartWebAdapterState();
}

class _DerivChartWebAdapterState extends State<_DerivChartWebAdapter> {
  _DerivChartWebAdapterState() {
    app = ChartApp(
      configModel,
      feedModel,
      indicatorsModel,
      drawingToolModel,
      accumulatorBarriersModel,
    );
    initDartInterop(app);
    JsInterop.onChartLoad();
  }

  final ChartFeedModel feedModel = ChartFeedModel();
  final ChartConfigModel configModel = ChartConfigModel();
  final IndicatorsModel indicatorsModel = IndicatorsModel();
  final DrawingToolModel drawingToolModel = DrawingToolModel();

  /// Times its barrier updates against the feed, so it needs [feedModel].
  late final AccumulatorBarriersModel accumulatorBarriersModel =
      AccumulatorBarriersModel(feedModel);

  late ChartApp app;
  late final JSExportedDartFunction _jsVisibilityHandler;
  int? leftBoundEpoch, rightBoundEpoch;
  bool isFollowMode = false;

  void _handleVisibilityChange(web.Event event) {
    if (configModel.startWithDataFitMode || feedModel.ticks.isEmpty) {
      return;
    }

    if (web.document.visibilityState == 'visible' && isFollowMode) {
      Timer(const Duration(milliseconds: 100), () {
        app.wrappedController.scrollToLastTick();
      });
    }

    if (web.document.visibilityState == 'hidden' && rightBoundEpoch != null) {
      isFollowMode = rightBoundEpoch! > feedModel.ticks.last.epoch;
    }
  }

  void onVisibleAreaChanged(int leftEpoch, int rightEpoch) {
    leftBoundEpoch = leftEpoch;
    rightBoundEpoch = rightEpoch;
  }

  @override
  void initState() {
    super.initState();
    _jsVisibilityHandler = _handleVisibilityChange.toJS;
    web.document.addEventListener('visibilitychange', _jsVisibilityHandler);
  }

  @override
  void dispose() {
    web.document.removeEventListener('visibilitychange', _jsVisibilityHandler);
    super.dispose();
  }

  @override
  Widget build(BuildContext _) => Scaffold(
        body: Center(
          child: Column(
            children: <Widget>[
              Expanded(
                child: LayoutBuilder(
                  builder: (BuildContext _, BoxConstraints constraints) =>
                      ValueListenableBuilder<bool>(
                    valueListenable: app.feedModel.feedLoadedNotifier,
                    builder: (BuildContext _, bool value, Widget? child) {
                      final bool showChart = app.getChartVisibilitity();
                      if (showChart == false) {
                        return Container(
                          color: configModel.theme is ChartDefaultLightTheme
                              ? Colors.white
                              : getColorFromString('rgba(24, 28, 37, 1)'),
                          constraints: const BoxConstraints.expand(),
                        );
                      }

                      app.calculateTickWidth();

                      return DerivChartWrapper(
                        app: app,
                        onVisibleAreaChanged: onVisibleAreaChanged,
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}
