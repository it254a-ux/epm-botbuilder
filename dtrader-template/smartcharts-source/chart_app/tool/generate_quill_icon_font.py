#!/usr/bin/env python3
"""Builds the icon font used by the on-chart indicator labels.

flutter-chart's `IndicatorLabelIcons` takes `IconData`, so the label's glyphs
have to come from a font. Rather than vendor a general-purpose icon font for
seven glyphs, this pulls those seven straight out of `@deriv/quill-icons` - the
same package the TypeScript dialogs draw from, already a dependency of this
repo - so the chart's icons and the surrounding UI stay in step.

Outputs (both checked in, so a normal build needs neither Python nor
node_modules):
  * fonts/QuillChartIcons.otf
  * lib/src/misc/quill_chart_icons.dart

Re-run after bumping @deriv/quill-icons:
    python3 chart_app/tool/generate_quill_icon_font.py

CFF outlines are used rather than TrueType because the source paths are cubic
béziers, which CFF stores natively - no cubic-to-quadratic conversion, so the
curves come out exactly as quill drew them.
"""

from __future__ import annotations

import pathlib
import re
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.transform import Transform
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

REPO = pathlib.Path(__file__).resolve().parents[2]
ICONS = REPO / "node_modules/@deriv/quill-icons/dist/esm/react/Standalone"
CHART_APP = REPO / "chart_app"

FAMILY = "QuillChartIcons"
UPEM = 1000
# Every quill standalone icon is drawn on this viewBox.
VIEWBOX = 32

# glyph name -> (quill component, code point). Code points sit in the Private
# Use Area; they are an internal contract between this font and the generated
# Dart below, so their exact values don't matter as long as both agree.
GLYPHS = {
    "eye": ("StandaloneEyeRegularIcon", 0xE000),
    "eyeSlash": ("StandaloneEyeSlashRegularIcon", 0xE001),
    "gear": ("StandaloneGearRegularIcon", 0xE002),
    "trash": ("StandaloneTrashRegularIcon", 0xE003),
    "arrowUp": ("StandaloneArrowUpRegularIcon", 0xE004),
    "arrowDown": ("StandaloneArrowDownRegularIcon", 0xE005),
    "chevronRight": ("StandaloneChevronRightRegularIcon", 0xE006),
}


def read_path(component: str) -> str:
    """The single `d` attribute out of a quill icon module."""
    source = (ICONS / f"{component}.js").read_text()
    paths = re.findall(r"\bd:\s*'([^']{20,})'", source)
    if len(paths) != 1:
        raise SystemExit(f"{component}: expected exactly 1 path, found {len(paths)}")
    return paths[0]


def build() -> None:
    if not ICONS.is_dir():
        raise SystemExit(f"quill-icons not found at {ICONS} - run npm install first")

    scale = UPEM / VIEWBOX
    # SVG's y axis points down and a font's points up, so the outline is
    # flipped and shifted up by one em as it is scaled.
    to_font = Transform(scale, 0, 0, -scale, 0, UPEM)

    order = [".notdef"] + list(GLYPHS)
    charstrings = {}
    metrics = {}

    notdef = T2CharStringPen(UPEM, {})
    charstrings[".notdef"] = notdef.getCharString()
    metrics[".notdef"] = (UPEM, 0)

    for name, (component, _) in GLYPHS.items():
        pen = T2CharStringPen(UPEM, {})
        parse_path(read_path(component), TransformPen(pen, to_font))
        charstrings[name] = pen.getCharString()
        metrics[name] = (UPEM, 0)

    fb = FontBuilder(UPEM, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({cp: name for name, (_, cp) in GLYPHS.items()})
    fb.setupCFF(FAMILY, {"FullName": FAMILY}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=UPEM, descent=0)
    fb.setupNameTable(
        {
            "familyName": FAMILY,
            "styleName": "Regular",
            "psName": FAMILY + "-Regular",
            "version": "1.0",
        }
    )
    fb.setupOS2(sTypoAscender=UPEM, usWinAscent=UPEM, usWinDescent=0)
    fb.setupPost()

    font_path = CHART_APP / "fonts" / f"{FAMILY}.otf"
    fb.save(font_path)

    dart = [
        "// GENERATED FILE - do not edit by hand.",
        "//",
        "// Produced by tool/generate_quill_icon_font.py from @deriv/quill-icons.",
        "// Re-run that script to update, and rebuild the web bundle afterwards.",
        "",
        "import 'package:deriv_chart/deriv_chart.dart';",
        "import 'package:flutter/widgets.dart';",
        "",
        "/// The quill glyphs bundled as `fonts/QuillChartIcons.otf`.",
        "///",
        "/// These back the on-chart indicator labels so their icons match the ones",
        "/// the surrounding dialogs use, instead of the library's Material defaults.",
        "abstract final class QuillChartIcons {",
        f"  static const String _family = '{FAMILY}';",
        "",
    ]
    for name, (component, cp) in GLYPHS.items():
        dart.append(f"  /// quill's `{component}`.")
        dart.append(
            f"  static const IconData {name} = "
            f"IconData(0x{cp:04X}, fontFamily: _family);"
        )
        dart.append("")
    dart += [
        "  /// The set handed to `DerivChart.indicatorLabelIcons`.",
        "  static const IndicatorLabelIcons labelIcons = IndicatorLabelIcons(",
        "    show: eye,",
        "    hide: eyeSlash,",
        "    settings: gear,",
        "    delete: trash,",
        "    moveUp: arrowUp,",
        "    moveDown: arrowDown,",
        "    expandCollapse: chevronRight,",
        "  );",
        "}",
        "",
    ]
    dart_path = CHART_APP / "lib" / "src" / "misc" / "quill_chart_icons.dart"
    dart_path.write_text("\n".join(dart))

    print(f"wrote {font_path.relative_to(REPO)} ({font_path.stat().st_size} bytes)")
    print(f"wrote {dart_path.relative_to(REPO)}")


if __name__ == "__main__":
    sys.exit(build())
