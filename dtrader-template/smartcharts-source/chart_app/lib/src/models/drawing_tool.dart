import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chart_app/src/interop/js_interop.dart';
import 'package:deriv_chart/core_chart.dart';

/// State and methods of chart web adapter config.
class DrawingToolModel {
  /// Initialize
  DrawingToolModel() {
    // Initialize drawing tools and repository
    drawingToolsRepo = AddOnsRepository<DrawingToolConfig>(
      createAddOn: (Map<String, dynamic> map) =>
          DrawingToolConfig.fromJson(map),
      onDeleteCallback: (AddOnConfig item, int index) {
        final Map<String, dynamic> config = item.toJson();
        // Convert the config to a JSON string and then parse it back to ensure it's properly serialized
        final String jsonConfigString = jsonEncode(config);
        // Pass both the name and the full config object
        JsInterop.drawingTool?.onRemove?.call(config['name'], jsonConfigString);
      },
      sharedPrefKey: 'drawing_tools',
    );

    drawingTools = DrawingTools(
      onMouseEnterCallback: (int index) =>
          JsInterop.drawingTool?.onMouseEnter?.call(index),
      onMouseExitCallback: (int index) =>
          JsInterop.drawingTool?.onMouseExit?.call(index),
    )..drawingToolsRepo = drawingToolsRepo;

    interactiveLayerBehaviour.controller.addListener(_onControllerStateChanged);

    // Add listener to the repository to detect when drawing tools are added/removed
    drawingToolsRepo.addListener(_onDrawingToolsRepoChanged);
  }

  InteractiveLayerBehaviour interactiveLayerBehaviour =
      InteractiveLayerDesktopBehaviour();

  /// Symbol of the chart
  String symbol = '';

  /// Drawing tools repo
  late AddOnsRepository<DrawingToolConfig> drawingToolsRepo;

  /// An always-empty drawing-tools repo handed to read-only chart instances
  /// (e.g. the contract-details replay chart). Passing this instead of
  /// [drawingToolsRepo] ensures the `InteractiveLayer` has nothing to render
  /// — `items` is empty and there is no UI path that adds to it. We never
  /// call `loadFromPrefs` on this repo, so it stays empty for the lifetime
  /// of the app and never overwrites SharedPreferences. The trade chart
  /// continues using the live [drawingToolsRepo] unchanged.
  final AddOnsRepository<DrawingToolConfig> emptyDrawingToolsRepo =
      AddOnsRepository<DrawingToolConfig>(
    createAddOn: (Map<String, dynamic> map) => DrawingToolConfig.fromJson(map),
    sharedPrefKey: '__replay_no_drawings__',
  );

  /// DrawingTools
  late DrawingTools drawingTools;

  InteractiveLayerController get interactiveLayerController =>
      interactiveLayerBehaviour.controller;

  /// Initialize new chart. Caller (ChartApp.newChart) is responsible for
  /// awaiting `chartReady` and then invoking [loadAndNotifyDrawings].
  void newChart(JSNewChart payload) {
    symbol = payload.symbol ?? '';
    // Deselect any drawing so the next mount starts in InteractiveNormalState.
    interactiveLayerBehaviour.resetToNormalState();
  }

  /// Loads drawings for the current [symbol] from SharedPreferences and
  /// notifies the JS side. Must be invoked AFTER the chart is mounted
  /// (await `ChartApp.chartReady` first); otherwise drawings would attempt to
  /// resolve their epoch/quote coordinates before the price axis exists.
  ///
  /// The JS-side notification fires unconditionally — even with an empty list
  /// — because `DrawToolsStore.onLoad` is the only path that resets the JS
  /// `activeToolsGroup` cache. Skipping the call on symbols with no saved
  /// drawings would leave the previous symbol's tools listed in the JS UI
  /// panel/badge while the Flutter chart underneath is correctly empty.
  Future<void> loadAndNotifyDrawings() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    drawingToolsRepo.loadFromPrefs(prefs, symbol);

    JsInterop.drawingTool?.onLoad?.call(getDrawingToolsRepoItems());
  }

  /// To select a drawing
  void selectDrawing(DrawingToolConfig config) {
    drawingTools.onDrawingToolSelection(config);
  }

  /// function to get drawtool items
  // List<DrawingToolConfig>? getDrawingToolsRepoItems() => drawingToolsRepo.items;

  ///
  List<String> getDrawingToolsRepoItems() =>
      drawingToolsRepo.items.map((e) => jsonEncode(e)).toList();

  updateFloatingMenuPosition(double x, double y) {
    interactiveLayerController.floatingMenuPosition = Offset(x, y);
  }

  void startAddingNewTool(String type) {
    final DrawingToolConfig config = getConfigFromType(type);
    interactiveLayerController.startAddingNewTool(config);
  }

  void cancelAddingNewTool() {
    interactiveLayerController.cancelAdding();
  }

  void _onControllerStateChanged() {
    if (interactiveLayerController.currentState is InteractiveAddingToolState) {
      final addingState =
          interactiveLayerController.currentState as InteractiveAddingToolState;
      final stepInfo = addingState.addingStateInfo;

      // Notify TypeScript about state change
      if (stepInfo != null) {
        JsInterop.drawingTool?.onStateChanged?.call(
          stepInfo.currentStep,
          stepInfo.totalSteps,
        );

        // If we've completed all steps, sync the drawing tools with JavaScript
        if (stepInfo.currentStep == stepInfo.totalSteps) {
          // Use WidgetsBinding to ensure proper timing
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            // TODO(Jim): Find a better way to ensure the chart is ready
            // Ensure the drawing tool is properly saved before notifying
            await Future.delayed(const Duration(milliseconds: 150));

            // The native repository should automatically save to SharedPreferences
            // Just sync with JavaScript side by calling onLoad with current items
            final List<String> drawingToolsJson = getDrawingToolsRepoItems();

            // Get the last added drawing tool and inform JavaScript side about it
            if (drawingToolsRepo.items.isNotEmpty) {
              final DrawingToolConfig lastAddedTool =
                  drawingToolsRepo.items.last;
              final String configJson = jsonEncode(lastAddedTool);
              JsInterop.drawingTool?.onToolAdded?.call(configJson);
            }

            JsInterop.drawingTool?.onLoad?.call(drawingToolsJson);

            // Trigger update to refresh the UI count and display
            JsInterop.drawingTool?.onUpdate?.call();
          });
        }
      }
    }
  }

  void _onDrawingToolsRepoChanged() {
    // Notify JavaScript side when drawing tools repository changes
    // This triggers a refresh of the UI to show the updated drawing tools count
    JsInterop.drawingTool?.onUpdate?.call();
  }

  /// To remove an existing drawing tool
  void removeDrawingTool(int index) {
    drawingToolsRepo.removeAt(index);
  }

  updateInteractiveLayerBehaviour(InteractiveLayerBehaviour newBehaviour) {
    if (interactiveLayerBehaviour.runtimeType != newBehaviour.runtimeType) {
      interactiveLayerBehaviour = newBehaviour;
      interactiveLayerBehaviour.controller
          .addListener(_onControllerStateChanged);
    }
  }

  DrawingToolConfig getConfigFromType(String type) {
    // TODO(Anyone): Uncomment the below cases when their implementations
    // are done.
    switch (type) {
      case 'vertical':
        return const VerticalDrawingToolConfig();
      case 'line':
        return const LineDrawingToolConfig();
      // case 'ray':
      //   return const RayDrawingToolConfig();
      // case 'continuous':
      //   return const ContinuousDrawingToolConfig();
      // case 'trend':
      //   return const TrendDrawingToolConfig();
      case 'horizontal':
        return const HorizontalDrawingToolConfig();
      // case 'channel':
      //   return const ChannelDrawingToolConfig();
      // case 'fibfan':
      //   return const FibfanDrawingToolConfig();
      // case 'rectangle':
      //   return const RectangleDrawingToolConfig();
      default:
        throw Exception('Unknown drawing tool type: $type');
    }
  }

  /// To clear the selection of drawing tool
  void clearDrawingToolSelect() {
    drawingTools.clearDrawingToolSelection();
  }

  /// To clear all drawing tool
  void clearDrawingTool() {
    drawingTools.clearDrawingToolSelection();
    drawingToolsRepo.clear();
  }
}
