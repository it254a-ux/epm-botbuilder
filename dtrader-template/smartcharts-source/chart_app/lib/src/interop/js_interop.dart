import 'dart:js_interop';

import 'package:deriv_chart/core_chart.dart';

/// Called when an addOn is to be edited
typedef OnEditCallback = void Function(int index);

/// Allow Updation when dragged (drawing tool)
typedef OnUpdateCallback = void Function();

/// Swaps two elements of a list.
typedef OnSwapCallback = void Function(int index1, int index2);

/// OnLoadCallback
typedef OnLoadCallback = void Function(List<dynamic> config);

/// JS Interop
@JS('window.jsInterop')
@staticInterop
class JsInterop {
  /// Called when the chart has loaded
  external static void onChartLoad();

  /// Called on each line series paint
  /// [currentTickPercent] - animation progress from 0 to 1
  /// [lerpedQuote] - the interpolated quote value (null if not animating)
  external static void onMainSeriesPaint(
      double currentTickPercent, double? lerpedQuote);

  /// Called when visible area is change
  external static void onVisibleAreaChanged(int leftEpoch, int rightEpoch);

  /// Called when visible quote area is change
  external static void onQuoteAreaChanged(double topQuote, double bottomQuote);

  /// Called when the Accumulators band is tapped.
  ///
  /// The band is a tap target rather than a drag handle: this is the host's cue
  /// to put its growth-rate control on screen, and the host then moves the band
  /// with `previewGrowthRate`.
  external static void onAccumulatorBarrierTap();

  /// Called the moment a press lands on the Accumulators band, before it is
  /// known whether it will become a tap or a pan.
  ///
  /// How a host tells its own gestures apart from the chart's: a document
  /// listener in the capture phase decides what a gesture means before the
  /// chart ever sees it, so the tap above arrives too late to stop a
  /// tap-anywhere handler acting on the same press.
  external static void onAccumulatorBarrierPress();

  /// Called to load additional history
  external static void loadHistory(JsLoadHistoryReq request);

  /// Indicator options
  external static JsIndicators? indicators;

  /// Drawingtool options
  external static JsDrawings? drawingTool;
}

@JS()
@staticInterop
@anonymous

/// Load history props
class JsLoadHistoryReq {
  /// JsLoadHistoryReq Object
  external factory JsLoadHistoryReq({required int count, required int end});
}

// Extension for JsLoadHistoryReq
extension JsLoadHistoryReqExtension on JsLoadHistoryReq {
  /// No of ticks/candles
  external int get count;

  /// End time
  external int get end;
}

@JS()
@staticInterop
@anonymous

/// Payload for new chart init
class JSNewChart {
  external factory JSNewChart();
}

// Extension for JSNewChart
extension JSNewChartExtension on JSNewChart {
  /// Whether the chart should be showing live data or not.
  external bool get isLive;

  /// Whether data fit mode is enabled.
  external bool get startWithDataFitMode;

  /// Granularity of the chart data
  external int get granularity;

  /// Market symbol
  external String? get symbol;

  /// Style of the chart
  external String? get chartType;

  /// Dart theme or light theme
  external String? get theme;

  /// Specifies the zoom level of the chart.
  external double? get msPerPx;

  /// Pipsize of the chart.
  external int? get pipSize;

  /// Specified if it is in mobile mode.
  external bool get isMobile;

  /// Specifies the margin of yAxis.
  external JSYAxisMargin get yAxisMargin;

  /// Whether smooth chart animations are enabled.
  external bool? get isSmoothChartEnabled;

  /// Whether the current spot's label should emphasise the quote's last digit.
  external bool? get shouldEmphasizeLastDigit;

  /// The vertical zoom to open at, or null to derive one from [yAxisMargin].
  external double? get verticalPaddingFraction;

  /// The Area chart's line colour, or null to keep the theme's own area colour.
  external String? get areaLineColor;

  /// The Area chart's line thickness, in logical pixels.
  external double? get areaLineThickness;

  /// Whether the Area chart fills the gradient beneath its line.
  external bool? get areaHasGradient;
}

@JS()
@staticInterop
@anonymous

/// Contract props
class JSContractsUpdate {
  external factory JSContractsUpdate();
}

// Extension for JSContractsUpdate
extension JSContractsUpdateExtension on JSContractsUpdate {
  /// List of markers belongs to a contract (accessing as JSObject for interop safety)
  @JS('markers')
  external JSAny? get markersJs;

  /// Contract type
  external String get type;

  /// Color of the markers
  external String? get color;

  /// Extra props needed to customize contract painting
  external JSObject? get props;

  /// Current epoch
  external int? get currentEpoch;

  /// Direction of the markers
  ///
  /// Nullable because in dart2js the undefined→null coercion is silent,
  /// but dart2wasm (skwasm) throws a TypeError when converting undefined to the
  /// non-nullable String type.
  external String? get direction;

  /// Profit/Loss text to be shown in marker group
  external String? get profitAndLossText;

  /// List of markers belongs to a contract
  List<JsMarker> get markers {
    final JSAny? jsMarkers = markersJs;
    if (jsMarkers == null) {
      return <JsMarker>[];
    }
    final JSArray<JSAny> jsArray = jsMarkers as JSArray<JSAny>;
    return jsArray.toDart
        .whereType<JSAny>()
        .map((JSAny item) => item as JsMarker)
        .toList();
  }
}

@JS()
@staticInterop
@anonymous

/// Marker props
class JsMarker {
  external factory JsMarker();
}

// Extension for JsMarker
extension JsMarkerExtension on JsMarker {
  /// Quote
  external double? get quote;

  /// Epoch
  external int? get epoch;

  /// Marker text
  external String? get text;

  /// Marker type
  external String? get type;

  /// Marker color
  external String? get color;

  /// Marker direction
  external String? get direction;

  /// Marker text type (e.g. 'plain', 'counter')
  external String? get textType;

  /// Horizontal pixel offset for the marker's rendered position.
  external double? get displayOffsetX;

  /// Vertical pixel offset for the marker's rendered position.
  /// Negative values move the marker upward.
  external double? get displayOffsetY;
}

@JS()
@staticInterop
@anonymous

/// Accumulators barrier payload.
///
/// Carries up to two bands at once, exactly as deriv_trader's chart does: the
/// [live] one (pre-trade proposal or running contract) and a [closed] one for a
/// contract that has just finished. Both can be on screen together — a knocked
/// out contract keeps its frozen band while the next proposal is already
/// drawing.
///
/// Every getter here and on the nested payloads is nullable on purpose. dart2js
/// silently coerces a missing JS property to null, but dart2wasm (skwasm) —
/// which is what `flutter build web --wasm` produces — throws a TypeError when
/// converting `undefined` to a non-nullable Dart type. The same reasoning is
/// spelled out on [JSContractsUpdateExtension.direction].
class JSAccumulatorBarriers {
  external factory JSAccumulatorBarriers();
}

// Extension for JSAccumulatorBarriers
extension JSAccumulatorBarriersExtension on JSAccumulatorBarriers {
  /// The band tracking the current spot: a pre-trade proposal or a running
  /// contract.
  @JS('live')
  external JSAny? get liveJs;

  /// The frozen band of a contract that has just finished.
  @JS('closed')
  external JSAny? get closedJs;

  /// How long to hold a [live] barrier update back, in milliseconds.
  /// Defaults to 500.
  external int? get barrierDelayMs;

  /// Configuration that makes the [live] band interactive.
  @JS('interaction')
  external JSAny? get interactionJs;

  /// The band tracking the current spot, or null.
  JSAccumulatorLiveBarriers? get live => liveJs as JSAccumulatorLiveBarriers?;

  /// The frozen band of a just-finished contract, or null.
  JSAccumulatorClosedBarriers? get closed =>
      closedJs as JSAccumulatorClosedBarriers?;

  /// The interaction configuration, or null when the band is read-only.
  JSAccumulatorBarrierInteraction? get interaction =>
      interactionJs as JSAccumulatorBarrierInteraction?;
}

@JS()
@staticInterop
@anonymous

/// Turns the Accumulators barriers into a growth-rate control.
///
/// The host owns the enablement rules and the ladder; the chart only snaps the
/// band to the nearest rung and reports it back.
class JSAccumulatorBarrierInteraction {
  /// JSAccumulatorBarrierInteraction Object
  external factory JSAccumulatorBarrierInteraction();
}

/// Extension for JSAccumulatorBarrierInteraction
extension JSAccumulatorBarrierInteractionExtension
    on JSAccumulatorBarrierInteraction {
  /// Whether the barriers are interactive right now.
  external bool? get enabled;

  /// The rate to show the band at, ahead of the barriers that go with it.
  ///
  /// The host's control moves the band; without this it would only catch up a
  /// proposal round-trip later. Null hands the band back to the model.
  external double? get previewGrowthRate;

  /// Whether to show the one-time hint that the band can be tapped.
  external bool? get showTapGuide;

  /// Copy for the tap hint's label, or null to show the hand alone.
  external String? get tapGuideLabel;

  /// The growth rates the user may pick between.
  @JS('steps')
  external JSAny? get stepsJs;

  /// The ladder, or an empty list when the host supplied none.
  List<JSAccumulatorGrowthRateStep> get steps {
    final JSArray<JSAny?>? array = stepsJs as JSArray<JSAny?>?;
    if (array == null) {
      return <JSAccumulatorGrowthRateStep>[];
    }
    return array.toDart
        .whereType<JSObject>()
        .cast<JSAccumulatorGrowthRateStep>()
        .toList();
  }
}

@JS()
@staticInterop
@anonymous

/// One selectable rung of the Accumulators growth-rate ladder.
class JSAccumulatorGrowthRateStep {
  /// JSAccumulatorGrowthRateStep Object
  external factory JSAccumulatorGrowthRateStep();
}

/// Extension for JSAccumulatorGrowthRateStep
extension JSAccumulatorGrowthRateStepExtension on JSAccumulatorGrowthRateStep {
  /// Growth rate as a fraction, e.g. 0.03 for 3%.
  external double? get growthRate;

  /// Distance between the spot and each barrier at this rung, in quote units.
  external double? get barrierSpotDistance;

  /// Pre-formatted [barrierSpotDistance] for the `±` labels.
  external String? get barrierSpotDistanceDisplay;

  /// Pre-formatted [growthRate], e.g. `'3%'`.
  external String? get growthRateDisplay;
}

@JS()
@staticInterop
@anonymous

/// The Accumulators band that tracks the current spot.
///
/// [profit] absent means this is a pre-trade proposal; present means a running
/// contract, and the painter colours the band by its sign.
class JSAccumulatorLiveBarriers {
  external factory JSAccumulatorLiveBarriers();
}

// Extension for JSAccumulatorLiveBarriers
extension JSAccumulatorLiveBarriersExtension on JSAccumulatorLiveBarriers {
  /// High barrier, as the display string the API returned.
  ///
  /// Kept as a string because its decimal count is what the barrier-distance
  /// label is rounded to.
  external String? get highBarrier;

  /// Low barrier, as the display string the API returned.
  external String? get lowBarrier;

  /// Epoch (seconds) of the tick these barriers belong to.
  external int? get barrierEpoch;

  /// Pre-formatted distance between a barrier and the spot. Computed from
  /// [highBarrier] when absent.
  external String? get barrierSpotDistance;

  /// The quote the painter compares against the barriers to detect a hit.
  external double? get spot;

  /// Epoch (seconds) of [spot].
  external int? get spotEpoch;

  /// Contract profit. Absent for a pre-trade proposal.
  external double? get profit;

  /// Currency shown next to [profit].
  external String? get currency;

  /// Decimals [profit] is rendered with. Defaults to 2.
  external int? get fractionalDigits;

  /// Whether the contract has been sold but its exit tick hasn't arrived yet.
  /// The band stays, the P/L overlay goes.
  external bool? get isSold;
}

@JS()
@staticInterop
@anonymous

/// The frozen Accumulators band of a contract that has just finished.
class JSAccumulatorClosedBarriers {
  external factory JSAccumulatorClosedBarriers();
}

// Extension for JSAccumulatorClosedBarriers
extension JSAccumulatorClosedBarriersExtension on JSAccumulatorClosedBarriers {
  /// High barrier at exit time, as the display string the API returned.
  external String? get highBarrier;

  /// Low barrier at exit time, as the display string the API returned.
  external String? get lowBarrier;

  /// Epoch (seconds) of the tick before the exit — where the band starts.
  external int? get barrierEpoch;

  /// Pre-formatted distance between a barrier and the exit spot.
  external String? get barrierSpotDistance;

  /// Exit quote — where the band ends.
  external double? get exitSpot;

  /// Epoch (seconds) of [exitSpot].
  external int? get exitEpoch;

  /// Final profit or loss of the contract.
  external double? get profit;

  /// Currency shown next to [profit].
  external String? get currency;

  /// Decimals [profit] is rendered with. Defaults to 2.
  external int? get fractionalDigits;

  /// How long to keep this band before retiring it, in milliseconds.
  ///
  /// Absent means keep it indefinitely — what a contract-details replay wants,
  /// since the finished contract is the whole point of that chart.
  external int? get retentionMs;
}

@JS()
@staticInterop
@anonymous

/// Quote props
class JsQuote {
  external factory JsQuote();
}

// Extension for JsQuote
extension JsQuoteExtension on JsQuote {
  /// Close value of the candle/tick
  external double get Close;

  /// High value of the candle
  external double? get High;

  /// Low value of the candle
  external double? get Low;

  /// Open value of the candle
  external double? get Open;

  /// Date of the quote data
  external String get Date;
}

@JS()
@staticInterop
@anonymous

/// Indicator props
class JsIndicators {
  external factory JsIndicators();
}

// Extension for JsIndicators
extension JsIndicatorsExtension on JsIndicators {
  /// Called when an indicator is removed
  @JS('onRemove')
  external JSAny? get onRemoveJs;

  /// Called when an indicator is edited
  @JS('onEdit')
  external JSAny? get onEditJs;

  /// Called when an indicator is updated
  @JS('onUpdate')
  external JSAny? get onUpdateJs;

  /// Callback to swap two elements of a list
  @JS('onSwap')
  external JSAny? get onSwapJs;

  /// Called when an indicator is removed
  void Function(int)? get onRemove {
    final JSAny? jsFunc = onRemoveJs;
    if (jsFunc == null) {
      return null;
    }
    return (int index) =>
        (jsFunc as JSFunction).callAsFunction(null, index.toJS);
  }

  /// Called when an indicator is edited
  void Function(int)? get onEdit {
    final JSAny? jsFunc = onEditJs;
    if (jsFunc == null) {
      return null;
    }
    return (int index) =>
        (jsFunc as JSFunction).callAsFunction(null, index.toJS);
  }

  /// Called when an indicator is updated
  void Function()? get onUpdate {
    final JSAny? jsFunc = onUpdateJs;
    if (jsFunc == null) {
      return null;
    }
    return () => (jsFunc as JSFunction).callAsFunction();
  }

  /// Callback to swap two elements of a list
  void Function(int, int)? get onSwap {
    final JSAny? jsFunc = onSwapJs;
    if (jsFunc == null) {
      return null;
    }
    return (int i, int j) =>
        (jsFunc as JSFunction).callAsFunction(null, i.toJS, j.toJS);
  }
}

/// Called when an addOn is created
typedef OnAddDrawingCallback = void Function();

/// Called when a drawing tool is added with JSON data
typedef OnToolAddedCallback = void Function(String toolJson);

/// Called when a drawing tool is removed with JSON data
typedef OnRemoveDrawingCallback = void Function(
    String deletedToolName, String? config);

/// Called when drawing tool state changes
typedef OnStateChangedCallback = void Function(int currentStep, int totalSteps);

/// Called when mouse enters over an addon
typedef OnMouseEnterCallback = void Function(int index);

/// Called when mouse exits over an addon
typedef OnMouseExitCallback = void Function(int index);

@JS()
@staticInterop
@anonymous

/// Drawings
class JsDrawings {
  external factory JsDrawings();
}

// Extension for JsDrawings
extension JsDrawingsExtension on JsDrawings {
  /// Called when an drawing is added
  @JS('onAdd')
  external JSAny? get onAddJs;

  /// Called when an drawing is edited/dragged
  @JS('onUpdate')
  external JSAny? get onUpdateJs;

  /// Called when the data is loaded from prefs
  @JS('onLoad')
  external JSAny? get onLoadJs;

  /// Called when a specific drawing tool is added
  @JS('onToolAdded')
  external JSAny? get onToolAddedJs;

  /// Called when an drawing is removed
  @JS('onRemove')
  external JSAny? get onRemoveJs;

  /// Called when an drawing is edited
  @JS('onEdit')
  external JSAny? get onEditJs;

  /// Callback to swap two elements of a list
  @JS('onSwap')
  external JSAny? get onSwapJs;

  /// Callback to notify mouse enter over the addon
  @JS('onMouseEnter')
  external JSAny? get onMouseEnterJs;

  /// Callback to notify mouse exit over the addon
  @JS('onMouseExit')
  external JSAny? get onMouseExitJs;

  /// Called when drawing tool state changes
  @JS('onStateChanged')
  external JSAny? get onStateChangedJs;

  /// Called when a drawing is added
  void Function()? get onAdd {
    final JSAny? jsFunc = onAddJs;
    if (jsFunc == null) {
      return null;
    }
    return () => (jsFunc as JSFunction).callAsFunction();
  }

  /// Called when a drawing is edited/dragged
  void Function()? get onUpdate {
    final JSAny? jsFunc = onUpdateJs;
    if (jsFunc == null) {
      return null;
    }
    return () => (jsFunc as JSFunction).callAsFunction();
  }

  /// Called when the data is loaded from prefs
  void Function(List<dynamic>)? get onLoad {
    final JSAny? jsFunc = onLoadJs;
    if (jsFunc == null) {
      return null;
    }
    return (List<dynamic> items) {
      final List<JSAny?> jsItems =
          items.map<JSAny?>((dynamic item) => (item as String).toJS).toList();
      (jsFunc as JSFunction).callAsFunction(null, jsItems.toJS);
    };
  }

  /// Called when a specific drawing tool is added
  OnToolAddedCallback? get onToolAdded {
    final JSAny? jsFunc = onToolAddedJs;
    if (jsFunc == null) {
      return null;
    }
    return (String toolJson) =>
        (jsFunc as JSFunction).callAsFunction(null, toolJson.toJS);
  }

  /// Called when a drawing is removed
  OnRemoveDrawingCallback? get onRemove {
    final JSAny? jsFunc = onRemoveJs;
    if (jsFunc == null) {
      return null;
    }
    return (String deletedToolName, String? config) => (jsFunc as JSFunction)
        .callAsFunction(null, deletedToolName.toJS, config?.toJS);
  }

  /// Called when a drawing is edited
  void Function(int)? get onEdit {
    final JSAny? jsFunc = onEditJs;
    if (jsFunc == null) {
      return null;
    }
    return (int index) =>
        (jsFunc as JSFunction).callAsFunction(null, index.toJS);
  }

  /// Callback to notify mouse enter over the addon
  void Function(int)? get onMouseEnter {
    final JSAny? jsFunc = onMouseEnterJs;
    if (jsFunc == null) {
      return null;
    }
    return (int index) =>
        (jsFunc as JSFunction).callAsFunction(null, index.toJS);
  }

  /// Callback to notify mouse exit over the addon
  OnMouseExitCallback? get onMouseExit {
    final JSAny? jsFunc = onMouseExitJs;
    if (jsFunc == null) {
      return null;
    }
    return (int index) =>
        (jsFunc as JSFunction).callAsFunction(null, index.toJS);
  }

  /// Called when drawing tool state changes
  OnStateChangedCallback? get onStateChanged {
    final JSAny? jsFunc = onStateChangedJs;
    if (jsFunc == null) {
      return null;
    }
    return (int currentStep, int totalSteps) => (jsFunc as JSFunction)
        .callAsFunction(null, currentStep.toJS, totalSteps.toJS);
  }

  /// Callback to swap two elements of a list
  void Function(int, int)? get onSwap {
    final JSAny? jsFunc = onSwapJs;
    if (jsFunc == null) {
      return null;
    }
    return (int i, int j) =>
        (jsFunc as JSFunction).callAsFunction(null, i.toJS, j.toJS);
  }
}

@JS()
@staticInterop
@anonymous

/// JsIndicatorTooltip
class JsIndicatorTooltip {
  /// Constructor for JS interop
  /// Only used internally - this is not directly called from Dart code
  external factory JsIndicatorTooltip._js({String name, JSArray values});

  /// Constructor that's used by the Dart code
  /// This is the public interface that accepts a List<String?>
  factory JsIndicatorTooltip(
      {required String name, required List<String?> values}) {
    // Convert each string to JSString and then create a JSArray
    final JSArray jsValues =
        values.map((str) => (str ?? "").toJS).toList().toJS;

    // Call the external factory with JS types
    return JsIndicatorTooltip._js(name: name, values: jsValues);
  }
}

// Extension for JsIndicatorTooltip
extension JsIndicatorTooltipExtension on JsIndicatorTooltip {
  /// Name
  external String get name;

  /// Values (accessing as JSObject for interop safety)
  @JS('values')
  external JSAny? get valuesJs;
}

@JS()
@staticInterop
@anonymous

/// JSYAxisMargin
class JSYAxisMargin {
  external factory JSYAxisMargin();
}

// Extension for JSYAxisMargin
extension JSYAxisMarginExtension on JSYAxisMargin {
  /// Top
  external double? get top;

  /// Bottom
  external double? get bottom;
}
