#!/bin/sh
# Run after copying the built template into public/dtrader-app (see REBUILD.md).
# The website's Charts page and DTrader each run a copy of the same chart engine in ONE browser page. The engine
# keeps its controls on shared global names (window.flutterChart, _flutter, flutterCanvasKit...), so the second copy
# took over the first one's controls and a chart went blank. This renames DTrader's copy to its own names (...Dt).
set -e
cd "$(dirname "$0")/../public/dtrader-app"
FILES=$(grep -rlE "_flutter\b|flutterChart|flutterCanvasKit|flutterConfiguration" . --include=*.js --include=*.mjs --include=*.html || true)
for f in $FILES; do
  sed -i -E \
    -e 's/flutterChartElement(Dt)?/flutterChartElementDt/g' \
    -e 's/flutterChartTheme(Dt)?/flutterChartThemeDt/g' \
    -e 's/\bflutterChart\b/flutterChartDt/g' \
    -e 's/\b_flutter\b/_flutterDt/g' \
    -e 's/flutterCanvasKit(Dt)?/flutterCanvasKitDt/g' \
    -e 's/flutterConfiguration(Dt)?/flutterConfigurationDt/g' \
    "$f"
done
echo "isolated: $(echo "$FILES" | wc -w) files"
