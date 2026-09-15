
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  ChartMode,
  ChartTitle,
  DrawTools,
  Share,
  SmartChart,
  StudyLegend,
  ToolbarWidget,
  Views,
} from '@deriv-com/smartcharts-champion';
import type { UseSmartChartsApiReturn } from '@/external/rise-fall-dtrader/hooks/use-smartcharts-api';
import type { SmartChartChartData } from '@/external/rise-fall-dtrader/hooks/use-smartchart-chart-data';
import type { ContractMarker } from '@/external/rise-fall-dtrader/lib/chart-markers';
import { SMART_CHART_DRAWING_TOOL_POSITION } from '@/external/rise-fall-dtrader/lib/smartchart-constants';

// setSmartChartsPublicPath used to be called here with a value gated on
// process.env.NEXT_PUBLIC_BASE_PATH — a Next.js env-var naming convention
// left over from before dtrader was ported into this Rsbuild-based app
// (see git history: "Port dtrader into botbuilder as a page"). That
// variable is never set anywhere in this project, so the call always fell
// through to its '/' fallback, forcing SmartCharts to fetch its lazily-
// loaded chunks (flutter-chart-loader-*.js, lz-string-*.js, etc.) from the
// literal site root — which 404s, since that isn't actually where Rsbuild
// serves them. That 404 (an HTML fallback page, not JS) is what threw
// "Uncaught SyntaxError: Unexpected token '<'" / ChunkLoadError in the
// console, and is why the chart canvas never rendered.
//
// bot-builder's own chart.tsx (src/pages/chart/chart.tsx) never calls this
// function at all, letting SmartCharts auto-detect its own correct base
// path — which is exactly why Charts always worked. Removed here to match
// that same, already-correct behavior.

/** Configuration for a single barrier rendered on the chart. */
export interface ChartBarrier {
  /** Shade type: 'ABOVE', 'BELOW', 'BETWEEN', 'OUTSIDE', 'NONE_SINGLE', 'NONE_DOUBLE'. */
  shade?: string;
  /** Barrier line color. */
  color?: string;
  /** Shade fill color (CSS variable on the shade div). */
  shadeColor?: string;
  /** Text color on the price label. */
  foregroundColor?: string;
  /** High barrier price value (absolute). */
  high?: number | string;
  /** Low barrier price value (absolute). */
  low?: number | string;
  /** Whether barriers are relative to the current spot price. */
  relative?: boolean;
  /** Whether the barrier can be dragged by the user. */
  draggable?: boolean;
  /** Hide the horizontal barrier line. */
  hideBarrierLine?: boolean;
  /** Hide the offscreen barrier indicator arrow. */
  hideOffscreenBarrier?: boolean;
  /** Hide the offscreen barrier line. */
  hideOffscreenLine?: boolean;
  /** Hide the price label on the barrier. */
  hidePriceLabel?: boolean;
}

export interface SmartChartWrapperProps {
  /** Unique chart instance id (e.g. `"rise-fall-chart"`, `"accumulator-chart"`). */
  chartId: string;
  /** Stable key when the underlying symbol changes. */
  symbolKey: string;
  symbol: string | undefined;
  isConnectionOpened: boolean;
  isMobile: boolean;
  chartData: SmartChartChartData | undefined;
  getQuotes: UseSmartChartsApiReturn['getQuotes'];
  subscribeQuotes: UseSmartChartsApiReturn['subscribeQuotes'];
  unsubscribeQuotes: UseSmartChartsApiReturn['unsubscribeQuotes'];
  /** Called when the user selects a symbol from the built-in ChartTitle market browser. */
  onSymbolChange?: (symbol: string) => void;
  /** Whether SmartCharts should expect a live subscription feed. Defaults to true. */
  isLive?: boolean;
  /** Unix epoch (seconds) to freeze the chart at for preview mode. */
  endEpoch?: number;
  /** Default granularity (0 = ticks, 60 = 1m candles, etc.). Defaults to 0. */
  defaultGranularity?: number;
  /** Barriers to display on the chart. */
  barriers?: ChartBarrier[];
  /** Contract markers to display entry/exit spots on the chart when trades are placed. */
  contractsArray?: ContractMarker[];
}

export function SmartChartWrapper({
  chartId,
  symbolKey,
  symbol,
  isConnectionOpened,
  isMobile,
  chartData,
  getQuotes,
  subscribeQuotes,
  unsubscribeQuotes,
  onSymbolChange,
  isLive = true,
  endEpoch,
  defaultGranularity = 0,
  barriers,
  contractsArray,
}: SmartChartWrapperProps) {
  const [chartType, setChartType] = useState<string | undefined>('line');
  const [granularity, setGranularity] = useState(defaultGranularity);

  // Defer SmartChart mounting until this wrapper is committed to the DOM.
  // React 18 concurrent rendering can yield between a component's constructor
  // (which kicks off Flutter's async initializeEngine) and componentDidMount
  // (which appends flutterChartElement to the DOM). When main.dart.js is in
  // the V8 bytecode cache it executes fast enough to win that race, calling
  // initializeEngine with a detached 0×0 element and producing a blank canvas.
  // By gating SmartChart behind a useEffect we guarantee the constructor only
  // runs inside a fresh synchronous task where React will not yield mid-render.
  const [isReadyToMount, setIsReadyToMount] = useState(false);
  useEffect(() => {
    // Unregister any Flutter standalone-app service worker that may have been
    // left behind by an earlier deployment — it caches chart assets and can
    // serve stale main.dart.js, which is the other trigger for a blank canvas.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations
          .filter(r => r.active?.scriptURL.includes('flutter_service_worker'))
          .forEach(r => r.unregister());
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsReadyToMount(true);
  }, []);

  // While Flutter's engine is still downloading/initializing (its JS runtime,
  // WebAssembly binary, and fonts), the chart element can silently capture
  // touch gestures — including vertical scroll swipes — before it has
  // anything ready to render. That makes the page's scroll feel "locked" for
  // as long as Flutter takes to boot, even though the rest of the page
  // (buttons, other UI) responds fine the whole time.
  //
  // Flutter web dispatches a `flutter-first-frame` event on `window` once its
  // engine has actually painted something and is ready to receive input.
  // Until that fires, we set `pointer-events: none` on the chart's wrapper so
  // touch gestures (like scrolling) pass through to the page underneath
  // instead of being swallowed by the still-loading chart. A fallback timer
  // flips it on regardless after 15s, in case this build of the library
  // doesn't dispatch that event.
  const [isChartReady, setIsChartReady] = useState(false);
  useEffect(() => {
    const handleFirstFrame = () => setIsChartReady(true);
    window.addEventListener('flutter-first-frame', handleFirstFrame);
    const fallbackTimer = setTimeout(() => setIsChartReady(true), 15000);
    return () => {
      window.removeEventListener('flutter-first-frame', handleFirstFrame);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // ── MOBILE FIX: Glass-pane tap blocker ────────────────────────────────────
  // Flutter web injects an <flt-glass-pane> element that covers the entire
  // viewport during initialization. It captures ALL pointer events at the
  // browser engine level — including taps on buttons and toggles outside the
  // chart — before CSS pointer-events rules on parent React elements can act.
  //
  // The existing CSS fix (touch-action: pan-y) only allows scroll gestures
  // through; it does NOT let taps reach DOM elements underneath. That's why
  // the automation panel (buttons, toggles, inputs) is dead for ~2 minutes
  // after page load: the glass pane eats every tap.
  //
  // This effect watches for the glass pane, measures whether it is still
  // full-screen (≥95% of viewport), and temporarily sets pointer-events: none
  // on it while it covers the whole page. When Flutter shrinks the pane to
  // only the chart canvas area, the observer removes pointer-events: none so
  // the chart itself can receive touches normally. Old/removed panes are
  // cleaned up automatically.
  useEffect(() => {
    const managedPanes = new WeakSet<HTMLElement>();
    const observers: ResizeObserver[] = [];

    const isFullScreen = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return rect.width >= vw * 0.95 && rect.height >= vh * 0.95;
    };

    const applyFix = (pane: HTMLElement) => {
      if (managedPanes.has(pane)) return;
      managedPanes.add(pane);

      // Start with pointer-events: none if the pane is full-screen
      if (isFullScreen(pane)) {
        pane.style.pointerEvents = 'none';
      }

      const ro = new ResizeObserver(() => {
        if (isFullScreen(pane)) {
          pane.style.pointerEvents = 'none';
        } else {
          pane.style.pointerEvents = '';
        }
      });
      ro.observe(pane);
      observers.push(ro);
    };

    // Handle already-existing panes
    document.querySelectorAll('flt-glass-pane').forEach(p => applyFix(p as HTMLElement));

    // Watch for new panes
    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'flt-glass-pane') {
            applyFix(node);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      observers.forEach(o => o.disconnect());
    };
  }, []);

  // ── CRASH FIX: Visibility-based remount ──────────────────────────────────
  // When the browser tab is backgrounded (user switches apps on mobile), the
  // browser throttles JS timers and the WebSocket connection. Flutter's render
  // loop breaks, and when the user returns the canvas is often frozen or
  // crashed. Additionally, tick subscriptions can pile up while the tab is
  // hidden, eventually exhausting the Deriv API connection limit.
  //
  // This effect unmounts the SmartChart when the tab is hidden, freeing
  // Flutter's WASM memory and canceling all subscriptions. When the tab
  // becomes visible again, the chart remounts fresh. If the tab was hidden
  // for more than 30 seconds, we force a full remount (clearing isReadyToMount
  // briefly) to guarantee a completely clean Flutter instance.
  const [isTabVisible, setIsTabVisible] = useState(true);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        setIsTabVisible(false); // Unmount chart → free Flutter memory
      } else {
        const hiddenAt = hiddenAtRef.current;
        const wasHiddenLong = hiddenAt && Date.now() - hiddenAt > 30_000;
        hiddenAtRef.current = null;

        if (wasHiddenLong) {
          // Force a full fresh remount after long inactivity
          setIsReadyToMount(false);
          // Small delay ensures React fully unmounts before remounting
          requestAnimationFrame(() => setIsTabVisible(true));
          const t = setTimeout(() => setIsReadyToMount(true), 50);
          return () => clearTimeout(t);
        } else {
          setIsTabVisible(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // FIX (part 1 — page zoom): trackpad pinch and ctrl+scroll-wheel gestures
  // over the chart were zooming the WHOLE BROWSER PAGE instead of just the
  // chart. Browsers detect a pinch/zoom gesture as a `wheel` event with
  // `ctrlKey: true` and, unless something calls preventDefault() on it,
  // treat that as a request to change the page's native zoom level.
  //
  // FIX (part 2 — trackpad zoom doing nothing / barely anything): the
  // chart's own zoom-in/out gesture recognizer only listens for real touch
  // events (phone/tablet pinch). A trackpad "pinch" is never a touch event —
  // the OS/browser translates it into the same ctrlKey wheel event as above,
  // which the chart's touch recognizer never sees, so nothing happened. A
  // plain trackpad two-finger scroll / mouse wheel has the same problem: no
  // touch event, so no zoom.
  //
  // Fix for both: this listener sits on the chart's own wrapper div (not the
  // whole page), is registered non-passive so preventDefault() actually
  // takes effect, and drives the chart's documented `zoom` prop directly —
  // the exact same 1 (zoom in) / -1 (zoom out) full-step action the
  // toolbar's +/- buttons already use. That gives trackpad pinch, trackpad
  // two-finger scroll, and mouse wheel all a real, full-size zoom step,
  // matching how scrolling zooms the chart on Deriv's own dtrader.
  //
  // The `zoom` prop is set for one render then cleared back to undefined a
  // beat later — this guarantees the NEXT scroll tick (even in the same
  // direction) is always seen as a fresh value change by the chart, rather
  // than potentially being ignored as "no change" if the same 1/-1 were left
  // sitting in place.
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [zoomAction, setZoomAction] = useState<1 | -1 | undefined>(undefined);
  const zoomResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastZoomAt = useRef(0);
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Always stop the browser's own native page-zoom / page-scroll
      // reaction to this gesture while it's happening over the chart —
      // whether it's a pinch (ctrlKey) or a plain scroll.
      e.preventDefault();

      // Throttle so a single fast pinch/scroll doesn't fire dozens of
      // full zoom steps at once — one step per ~120ms feels responsive
      // without being jumpy.
      const now = Date.now();
      if (now - lastZoomAt.current < 120) return;
      lastZoomAt.current = now;

      const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1;
      if (zoomResetTimeout.current) clearTimeout(zoomResetTimeout.current);
      setZoomAction(direction);
      zoomResetTimeout.current = setTimeout(() => setZoomAction(undefined), 60);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (zoomResetTimeout.current) clearTimeout(zoomResetTimeout.current);
    };
  }, []);

  const { resolvedTheme } = useTheme();
  const chartTheme =
    (resolvedTheme ?? (document.documentElement.classList.contains('dark') ? 'dark' : 'light')) === 'dark'
      ? 'dark'
      : 'light';

  const chartSettings = useMemo(
    () => ({
      language: 'en' as const,
      isHighestLowestMarkerEnabled: false,
      theme: chartTheme,
    }),
    [chartTheme]
  );

  // Missing `portalNodeId` here (unlike bot-builder's own Charts page,
  // src/pages/chart/toolbar-widgets.tsx, which passes 'modal_root' to every
  // one of these) is why dtrader's chart toolbar was missing several
  // elements — without a portal target, these widgets' dropdown/menu
  // content (chart type picker, indicator legend, drawing tools panel,
  // share dialog) had nowhere valid to render into. 'modal_root' is a
  // single global DOM node (in index.html) already used the same way by
  // bot-builder's own Charts page — safe to reuse since only one chart tab
  // is visible/interactive at a time.
  const toolbarWidget = useCallback(
    () => (
      <ToolbarWidget>
        <ChartMode portalNodeId='modal_root' onChartType={setChartType} onGranularity={setGranularity} />
        {!isMobile && <StudyLegend portalNodeId='modal_root' />}
        {!isMobile && (
            <Views portalNodeId='modal_root' onChartType={setChartType} onGranularity={setGranularity} />
        )}
        <DrawTools portalNodeId='modal_root' />
        {!isMobile && <Share portalNodeId='modal_root' />}
      </ToolbarWidget>
    ),
    [isMobile]
  );

  const topWidgets = useCallback(
    () => <ChartTitle onChange={onSymbolChange} />,
    [onSymbolChange]
  );

  return (
    <div
      ref={chartWrapperRef}
      className="relative h-full min-h-0 w-full overflow-clip rounded-md border border-border/50 dark:border-white/[0.08] bg-muted/30"
      style={{ pointerEvents: isChartReady ? 'auto' : 'none' }}
    >
      {isReadyToMount && isTabVisible && <SmartChart
        // Theme is appended to the key so the chart remounts (and repaints
        // in the new theme) whenever it changes. This chart is backed by a
        // Flutter/WebAssembly widget that only reads `settings.theme` once,
        // on mount — passing an updated `settings` prop alone doesn't make
        // it redraw, so a full remount is needed to apply theme changes live.
        key={`${symbolKey}-${chartTheme}`}
        chartControlsWidgets={null}
        chartData={chartData}
        chartStatusListener={() => {}}
        chartType={chartType}
        clearChart={false}
        drawingToolFloatingMenuPosition={
          isMobile ? SMART_CHART_DRAWING_TOOL_POSITION.mobile : SMART_CHART_DRAWING_TOOL_POSITION.desktop
        }
        enabledChartFooter={false}
        enabledNavigationWidget={!isMobile}
        getQuotes={getQuotes}
        granularity={granularity}
        id={chartId}
        isConnectionOpened={isConnectionOpened}
        isLive={isLive}
        isMobile={isMobile}
        isVerticalScrollEnabled={false}
        {...(endEpoch !== undefined && { endEpoch })}
        maxTick={isMobile ? (granularity === 0 ? 8 : 24) : undefined}
        onSettingsChange={() => {}}
        settings={chartSettings}
        stateChangeListener={() => {}}
        subscribeQuotes={subscribeQuotes}
        symbol={symbol}
        toolbarWidget={toolbarWidget}
        topWidgets={topWidgets}
        unsubscribeQuotes={unsubscribeQuotes}
        {...(barriers && barriers.length > 0 && { barriers })}
        contracts_array={contractsArray ?? []}
        {...(zoomAction !== undefined && { zoom: zoomAction })}
      />}
    </div>
  );
}
