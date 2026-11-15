import 'dart:js_interop';
import 'package:chart_app/src/misc/web_chart_themes.dart';
import 'dart:js_interop_unsafe';

import 'package:chart_app/src/helpers/color.dart';
import 'package:deriv_chart/core_chart.dart';
import 'package:flutter/material.dart';
import 'package:chart_app/src/interop/js_interop.dart';
import 'package:web/web.dart' as web;

/// Opacity of the area gradient's top stop, matching the chart themes' own area
/// gradient, which is the line colour at 16% fading out to fully transparent.
const double _areaGradientStartOpacity = 0.16;

/// State and methods of chart web adapter config.
class ChartConfigModel extends ChangeNotifier {
  /// Initialize
  ChartConfigModel() {
    // The JS wrapper exposes the host's current theme on
    // `window.flutterChartTheme` before the engine boots. Seeding it here
    // makes the engine's very first frame match the host theme instead of
    // flashing the light default until updateTheme arrives via interop.
    final Object? initialTheme =
        web.window.getProperty('flutterChartTheme'.toJS)?.dartify();
    if (initialTheme == 'dark') {
      theme = WebChartDarkTheme();
    }
  }

  /// Style of the chart
  ChartStyle style = ChartStyle.line;

  /// Granularity
  int? granularity;

  /// Theme of the chart
  ChartTheme theme = WebChartLightTheme();

  /// Markers
  List<MarkerGroup> markerGroupList = <MarkerGroup>[];

  /// Whether the chart should be showing live data or not.
  bool isLive = true;

  /// Starts in data fit mode and adds a data-fit button.
  bool startWithDataFitMode = false;

  /// Specifies whether the symbol is closed or not.
  bool isSymbolClosed = false;

  /// Specifies the zoom level of the chart.
  double? msPerPx;

  /// Specifies the left margin to prevent overlap.
  double? leftMargin;

  /// Specifies the right padding.
  int? rightPadding;

  /// Type of the contract
  String? contractType;

  /// Market symbol
  String symbol = '';

  /// Pip size of the chart
  int pipSize = 4;

  /// Whether the crosshair cursor should be shown or not.
  bool showCrosshair = true;

  /// Specifies if it is in mobile mode
  bool isMobile = false;

  /// Specifies the margin of yAxis.
  JSYAxisMargin? yAxisMargin;

  /// Whether smooth chart animations are enabled.
  bool isSmoothChartEnabled = true;

  /// The vertical zoom to open the chart at, or null to derive one from
  /// [yAxisMargin].
  ///
  /// Sets the scale rather than fixing it: the user can still drag the quote
  /// labels away from it. The host changes it when the trade type changes —
  /// Accumulators wants the barriers as tall as possible, since a squashed band
  /// is neither readable nor draggable.
  double? verticalPaddingFraction;

  /// Whether the current spot's label should emphasise the quote's last digit.
  ///
  /// Digit contracts (Matches/Differs, Over/Under, Even/Odd) are decided by
  /// that digit alone, so the host turns this on while one of them is on
  /// screen and off again otherwise.
  bool shouldEmphasizeLastDigit = false;

  /// The Area chart's line colour, or null to use the theme's own area colour.
  ///
  /// Null is the "Default" swatch in the host's picker, and is not the same as
  /// any fixed colour: the theme paints the area near-black on light and
  /// near-white on dark, and only the theme knows which is in effect.
  Color? areaLineColor;

  /// The Area chart's line thickness, in logical pixels.
  ///
  /// Defaults to the middle of the host's three options rather than the
  /// library's own 1px, which reads too faint on a desktop-width chart.
  double areaLineThickness = 2;

  /// Whether the Area chart fills the gradient beneath its line.
  bool areaHasGradient = true;

  /// Show the time interval
  bool showTimeInterval = false;

  /// Remaining time when the timeInterval is shown
  String remainingTime = '--:--';

  /// To update style of the chart
  // ignore: avoid_positional_boolean_parameters
  void updateLiveStatus(bool _isLive) {
    isLive = _isLive;
    notifyListeners();
  }

  /// To update style of the chart
  void updateChartStyle(String chartStyle) {
    style = ChartStyle.values.byName(chartStyle);
    notifyListeners();
  }

  /// The style the Area chart's line and gradient are painted with.
  ///
  /// Starts from the theme's own `lineStyle` so anything the host leaves unset
  /// keeps the themed value, then applies the host's choices on top.
  ///
  /// The gradient is derived from the line colour rather than carried
  /// separately: the host picks a single colour seed, and the theme's own
  /// gradient is that same colour at 16% fading out to fully transparent, so
  /// re-deriving it reproduces the default exactly while keeping a chosen
  /// colour's fill in its own hue.
  LineStyle get lineStyle {
    final Color? lineColor = areaLineColor;

    return theme.lineStyle.copyWith(
      color: lineColor,
      thickness: areaLineThickness,
      hasArea: areaHasGradient,
      areaGradientColors: lineColor == null
          ? null
          : (
              start: lineColor.withOpacity(_areaGradientStartOpacity),
              end: lineColor.withOpacity(0),
            ),
    );
  }

  /// To update the Area chart's line colour, thickness and gradient fill.
  ///
  /// A null [color] restores the theme's own area colour; null [thickness] or
  /// [hasGradient] leave those values as they are, so the host can push a
  /// partial update without having to restate the rest.
  void updateAreaStyle({
    String? color,
    double? thickness,
    bool? hasGradient,
  }) {
    _setAreaStyle(
      color: color,
      thickness: thickness,
      hasGradient: hasGradient,
    );
    notifyListeners();
  }

  /// The assignments behind [updateAreaStyle], without the notification, so
  /// [newChart] can apply them as part of its own single notify.
  void _setAreaStyle({
    String? color,
    double? thickness,
    bool? hasGradient,
  }) {
    areaLineColor = color == null ? null : getColorFromString(color);

    if (thickness != null) {
      areaLineThickness = thickness;
    }
    if (hasGradient != null) {
      areaHasGradient = hasGradient;
    }
  }

  /// Get remaining time of the chart
  void setRemainingTime(String time) {
    remainingTime = time;
    notifyListeners();
  }

  /// Update markers
  void updateContracts(List<JSContractsUpdate> _markerGroupList) {
    markerGroupList = <MarkerGroup>[];

    for (final JSContractsUpdate _markerGroup in _markerGroupList) {
      final List<ChartMarker> markers = <ChartMarker>[];

      contractType = _markerGroup.type;

      for (final JsMarker _marker in _markerGroup.markers) {
        if (_marker.quote != null &&
            _marker.epoch != null &&
            _marker.type != null) {
          markers.add(ChartMarker(
            quote: _marker.quote!,
            epoch: _marker.epoch! * 1000,
            text: _marker.text,
            textType: _marker.textType != null
                ? MarkerTextType.values.byName(_marker.textType!)
                : MarkerTextType.plain,
            markerType: MarkerType.values.byName(_marker.type!),
            direction: MarkerDirection.values
                .byName(_marker.direction ?? 'up'), // Default to 'up' if null
            color: _marker.color != null
                ? getColorFromString(_marker.color!)
                : null,
            displayOffset: _getDisplayOffset(_marker),
          ));
        }
      }

      Color _bgColor = Colors.white;

      if (_markerGroup.color != null) {
        _bgColor = getColorFromString(_markerGroup.color!);
      }

      markerGroupList.add(
        MarkerGroup(
          markers,
          direction:
              MarkerDirection.values.byName(_markerGroup.direction ?? 'up'),
          type: _markerGroup.type,
          style: MarkerStyle(
            backgroundColor: _bgColor,
          ),
          props: MarkerProps(
            hasPersistentBorders:
                _getProperty(_markerGroup.props, 'hasPersistentBorders') ??
                    false,
            isProfit: _getProperty(_markerGroup.props, 'isProfit') ?? true,
            isRunning: _getProperty(_markerGroup.props, 'isRunning') ?? true,
            markerLabel: _getProperty(_markerGroup.props, 'markerLabel'),
            contractMarkerLeftPadding:
                _getProperty(_markerGroup.props, 'contractMarkerLeftPadding') ??
                    8.0,
          ),
          currentEpoch: _markerGroup.currentEpoch,
          profitAndLossText: _markerGroup.profitAndLossText,
        ),
      );
    }
    notifyListeners();
  }

  Offset _getDisplayOffset(JsMarker marker) => Offset(
        marker.displayOffsetX ?? 0,
        marker.displayOffsetY ?? 0,
      );

  /// To update the theme of the chart
  void updateTheme(String _theme) {
    theme = _theme == 'dark' ? WebChartDarkTheme() : WebChartLightTheme();
    notifyListeners();
  }

  /// To update whether the current spot's last digit is emphasised
  // ignore: avoid_positional_boolean_parameters
  void updateLastDigitEmphasis(bool _shouldEmphasizeLastDigit) {
    shouldEmphasizeLastDigit = _shouldEmphasizeLastDigit;
    notifyListeners();
  }

  /// Sets the chart's vertical zoom. Pass null to fall back to [yAxisMargin].
  void updateVerticalPaddingFraction(double? _verticalPaddingFraction) {
    verticalPaddingFraction = _verticalPaddingFraction;
    notifyListeners();
  }

  /// To update the theme of the chart
  // ignore: avoid_positional_boolean_parameters
  void updateCrosshairVisibility(bool _showCrosshair) {
    showCrosshair = _showCrosshair;
    notifyListeners();
  }

  /// To update leftMargin
  void updateLeftMargin(double _leftMargin) {
    leftMargin = _leftMargin;
    notifyListeners();
  }

  /// To update leftMargin
  void updateRightPadding(int _rightPadding) {
    rightPadding = _rightPadding;
    notifyListeners();
  }

  /// To update the symbol open status
  // ignore: avoid_positional_boolean_parameters
  void setSymbolClosed(bool _isSymbolClosed) {
    isSymbolClosed = _isSymbolClosed;
    notifyListeners();
  }

  /// To set the time interval
  // ignore: avoid_positional_boolean_parameters
  void toggleTimeIntervalVisibility(bool showInterval) {
    showTimeInterval = showInterval;
    notifyListeners();
  }

  /// Initialize new chart
  void newChart(JSNewChart payload) {
    granularity = payload.granularity;
    isLive = payload.isLive;
    startWithDataFitMode = payload.startWithDataFitMode;
    msPerPx = payload.msPerPx;
    pipSize = payload.pipSize ?? 4;
    isMobile = payload.isMobile;
    yAxisMargin = payload.yAxisMargin;
    symbol = payload.symbol ?? '';
    isSmoothChartEnabled = payload.isSmoothChartEnabled ?? true;
    shouldEmphasizeLastDigit = payload.shouldEmphasizeLastDigit ?? false;
    verticalPaddingFraction = payload.verticalPaddingFraction;

    _setAreaStyle(
      color: payload.areaLineColor,
      thickness: payload.areaLineThickness,
      hasGradient: payload.areaHasGradient,
    );

    if (payload.chartType != null && payload.chartType!.isNotEmpty) {
      style = ChartStyle.values.byName(payload.chartType!);
    }

    if (payload.theme != null && payload.theme!.isNotEmpty) {
      theme =
          payload.theme == 'dark' ? WebChartDarkTheme() : WebChartLightTheme();
    }

    notifyListeners();
  }

  /// Safely retrieves a property value from a JavaScript object.
  ///
  /// This utility method provides a safe way to access properties
  /// from JavaScript objects
  /// in Dart, handling the null case to prevent runtime errors.
  ///
  /// Parameters:
  /// - [props]: The JavaScript object from which to retrieve the property.
  ///   If null, the method returns null without attempting to access
  /// any property.
  /// - [targetPropName]: The name of the property to retrieve from the
  /// JavaScript object.
  ///
  /// Returns:
  /// - The value of the specified property if the JavaScript object exists and
  /// contains the property.
  /// - null if the JavaScript object is null or the property doesn't exist.
  ///
  /// This method is used internally to safely extract properties
  /// from JavaScript objects
  /// passed from the web side, particularly for marker properties in the
  /// chart configuration.
  dynamic _getProperty(JSObject? props, String targetPropName) {
    if (props == null) {
      return null;
    }

    // .dartify() converts JS primitives to their Dart equivalents
    // (JSBoolean→bool, JSNumber→num, JSString→String, undefined→null).
    // Without this, dart2wasm (skwasm) throws a TypeError when the caller
    // assigns the returned JSAny to a typed Dart field such as `bool` or
    // `double`, because dart2wasm enforces strict type safety between JS
    // interop types and Dart primitives — unlike dart2js where they share
    // the same JavaScript runtime representation.
    return props.getProperty(targetPropName.toJS)?.dartify();
  }
}
