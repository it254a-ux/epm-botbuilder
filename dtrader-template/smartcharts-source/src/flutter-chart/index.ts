import ChartAdapterStore from 'src/store/ChartAdapterStore';
import { TEngineInitializer } from 'src/types';

type TCreateChartElementProps = {
    onChartLoad: ChartAdapterStore['onChartLoad'];
};

export const createChartElement = ({ onChartLoad }: TCreateChartElementProps) => {
    // Chart element is set in a window element for faster initialization
    if (window.flutterChartElement) {
        onChartLoad();
        return;
    }

    setupListeners();

    const flutterChartElement = document.createElement('div');
    flutterChartElement.classList.add('flutter-chart');

    window.flutterChartElement = flutterChartElement;

    // Only initialise our own state tracking. Do NOT pre-set loader here —
    // flutter.js uses `window._flutter.loader||(window._flutter.loader=new k)`
    // and any truthy value (even {}) would prevent it from creating the real loader.
    (window._flutter as Partial<Window['_flutter']>) = {
        initState: {
            isInitialRunCompleted: false,
            isEngineInitialized: false,
            isMounted: false,
        },
    };

    // __webpack_public_path__ is set by setSmartChartsPublicPath() at runtime.
    // chart/ subdirectory is where main.dart.wasm, main.dart.mjs, flutter.js live.
    /* eslint-disable no-undef */
    const chartBase = __webpack_public_path__;
    const chartDir = __webpack_public_path__ + 'chart/';
    /* eslint-enable no-undef */

    // onEntrypointLoaded is called by the Flutter loader after the engine entrypoint
    // (either main.dart.wasm or main.dart.js) has been compiled/parsed.
    const onEntrypointLoaded = async (engineInitializer: TEngineInitializer) => {
        window._flutter.appRunner = await engineInitializer.initializeEngine({
            assetBase: chartBase,
            hostElement: window.flutterChartElement,
        });
        window._flutter.initState.isEngineInitialized = true;

        runChartApp();
    };

    // Load flutter.js (the engine loader) first — it sets up window._flutter.loader
    // with full WASM + JS build-selection logic (skwasm → canvaskit fallback).
    // Removed webpackPreload to prevent 5MB unnecessary preload for non-chart users.
    // @ts-expect-error chart dynamic load
    import(/* webpackChunkName: "flutter-chart-loader" */ 'chart/flutter.js').then(() => {
        // Set build config if not already provided by flutter_bootstrap.js.
        // Declares both WASM (primary) and JS (canvaskit fallback) build targets.
        if (!window._flutter.buildConfig) {
            window._flutter.buildConfig = {
                builds: [
                    {
                        compileTarget: 'dart2wasm',
                        renderer: 'skwasm',
                        mainWasmPath: 'main.dart.wasm',
                        jsSupportRuntimePath: 'main.dart.mjs',
                    },
                    {
                        compileTarget: 'dart2js',
                        renderer: 'canvaskit',
                        mainJsPath: 'main.dart.js',
                    },
                ],
            };
        }

        // entryPointBaseUrl MUST be in config passed to load() — flutter.js reads it
        // there to construct fetch/import URLs for main.dart.wasm and main.dart.mjs.
        // canvasKitBaseUrl overrides the default "canvaskit" relative URL (which would
        // resolve to the page root instead of the chart subdirectory).
        // assetBase and hostElement are also forwarded to initializeEngine() by Flutter.
        window._flutter.loader.load({
            onEntrypointLoaded,
            config: {
                entryPointBaseUrl: chartDir,
                assetBase: chartBase,
                canvasKitBaseUrl: chartDir + 'canvaskit',
                hostElement: window.flutterChartElement,
            },
        });
    });

    return flutterChartElement;
};

const setupListeners = () => {
    const listener = (ev: KeyboardEvent) => {
        // To fix a trackjs issue caused by some keyboard events that don't contain `key` or `code` props.
        // https://github.com/flutter/engine/blob/f20657354d8b53baafcec55650830ead89adf3e9/lib/web_ui/lib/src/engine/keyboard_binding.dart#L386
        if (!ev.key || !ev.code) {
            ev.stopImmediatePropagation();
        }
    };

    window.addEventListener('keydown', listener, true);
    window.addEventListener('keyup', listener, true);
};

export const runChartApp = () => {
    if (window._flutter.initState.isMounted) {
        window._flutter.appRunner?.runApp();
        window._flutter.initState.isInitialRunCompleted = true;
    }
};
