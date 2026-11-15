// GENERATED FILE - do not edit by hand.
//
// Produced by tool/generate_quill_icon_font.py from @deriv/quill-icons.
// Re-run that script to update, and rebuild the web bundle afterwards.

import 'package:deriv_chart/deriv_chart.dart';
import 'package:flutter/widgets.dart';

/// The quill glyphs bundled as `fonts/QuillChartIcons.otf`.
///
/// These back the on-chart indicator labels so their icons match the ones
/// the surrounding dialogs use, instead of the library's Material defaults.
abstract final class QuillChartIcons {
  static const String _family = 'QuillChartIcons';

  /// quill's `StandaloneEyeRegularIcon`.
  static const IconData eye = IconData(0xE000, fontFamily: _family);

  /// quill's `StandaloneEyeSlashRegularIcon`.
  static const IconData eyeSlash = IconData(0xE001, fontFamily: _family);

  /// quill's `StandaloneGearRegularIcon`.
  static const IconData gear = IconData(0xE002, fontFamily: _family);

  /// quill's `StandaloneTrashRegularIcon`.
  static const IconData trash = IconData(0xE003, fontFamily: _family);

  /// quill's `StandaloneArrowUpRegularIcon`.
  static const IconData arrowUp = IconData(0xE004, fontFamily: _family);

  /// quill's `StandaloneArrowDownRegularIcon`.
  static const IconData arrowDown = IconData(0xE005, fontFamily: _family);

  /// quill's `StandaloneChevronRightRegularIcon`.
  static const IconData chevronRight = IconData(0xE006, fontFamily: _family);

  /// The set handed to `DerivChart.indicatorLabelIcons`.
  static const IndicatorLabelIcons labelIcons = IndicatorLabelIcons(
    show: eye,
    hide: eyeSlash,
    settings: gear,
    delete: trash,
    moveUp: arrowUp,
    moveDown: arrowDown,
    expandCollapse: chevronRight,
  );
}
