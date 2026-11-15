const webpack = require('webpack');
const path = require('path');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');
const SpriteLoaderPlugin = require('svg-sprite-loader/plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

const production = process.env.NODE_ENV === 'production';
const isApp = process.env.BUILD_MODE === 'app';
const BUILD_MODE = isApp ? process.env.BUILD_MODE : 'lib';
const appEntryFile = isApp && process.env.APP_ENTRY ? process.env.APP_ENTRY : 'index';

const output = {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '',
    filename: 'smartcharts.js',
    chunkFilename: '[name]-[chunkhash:6].smartcharts.js',
    libraryExport: 'default',
    library: 'smartcharts',
    libraryTarget: 'umd',
    hashDigestLength: 6,
};

const config = {
    // Use hidden-source-map in production to generate maps without exposing them in the bundle
    // This reduces main bundle size while still allowing error tracking services to use maps
    devtool: production ? 'hidden-source-map' : 'source-map',
    entry: path.resolve(__dirname, './src/index.ts'),
    output,
    resolve: {
        alias: {
            '@deriv-com/smartcharts': path.resolve(__dirname, 'src/'),
            src: path.resolve(__dirname, 'src'),
            chart: path.resolve(__dirname, 'chart_app/build/web'),
        },
        extensions: ['.ts', '.tsx', '.js'],
    },
    devServer: {
        static: {
            directory: path.join(__dirname, '.'),
            serveIndex: true,
            staticOptions: {
                redirect: true,
            },
        },
        devMiddleware: {
            writeToDisk: true,
        },
        // Cross-Origin Isolation headers enable the skwasm WASM renderer in supported browsers,
        // Without them, window.crossOriginIsolated is false and Flutter falls back to canvaskit.
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless',
        },
    },
    module: {
        noParse: [/main\.dart\.js$/, /flutter\.js$/, /main\.dart\.mjs$/, /canvaskit\/.*\.js$/],
        rules: [
            {
                test: /\.svg$/,
                use: [
                    {
                        loader: 'svg-sprite-loader',
                        options: {
                            extract: true,
                            spriteFilename: 'sprite-[hash:6].smartcharts.svg',
                            esModule: false,
                        },
                    },
                    {
                        loader: 'svgo-loader',
                        options: {
                            plugins: [
                                {
                                    name: 'removeUselessStrokeAndFill',
                                    removeUselessStrokeAndFill: false,
                                },
                                {
                                    name: 'removeUnknownsAndDefaults',
                                    removeUnknownsAndDefaults: false,
                                },
                            ],
                        },
                    },
                ],
            },
            {
                // Raster illustrations (empty states) ship as separate files rather than
                // inlined base64, so they stay out of the JS bundle and can be cached on
                // their own. The `.smartcharts.` in the name is deliberate: host apps already
                // copy `dist/*.smartcharts.*` (see README), so the file travels with the
                // chunks without anyone changing their build. At runtime the URL resolves
                // against `__webpack_public_path__`, which hosts set via
                // `setSmartChartsPublicPath`.
                test: /\.webp$/,
                type: 'asset/resource',
                generator: {
                    filename: '[name]-[hash:6].smartcharts.webp',
                },
            },
            {
                test: /\.(s*)css$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            esModule: false,
                        },
                    },
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: true,
                            esModule: true,
                            modules: {
                                mode: 'icss',
                            },
                        },
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            postcssOptions: {
                                plugins: ['postcss-import', 'postcss-preset-env', 'postcss-inline-svg', 'postcss-svgo'],
                            },
                        },
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sourceMap: true,
                            additionalData: (content, loaderContext) => {
                                const { resourcePath, rootContext } = loaderContext;

                                const relativeFilePath = path.relative(rootContext, resourcePath);
                                const isExcluded = relativeFilePath.match(/\/_themes\.scss$/);

                                return isExcluded
                                    ? `@import "sass/_variables.scss"; ${content}`
                                    : `@import "sass/_variables.scss";@import "sass/_themes.scss"; ${content}`;
                            },
                            sassOptions: {
                                filePaths: [path.resolve(__dirname, './src')],
                            },
                        },
                    },
                ],
            },
            /**
             * this is a temporary fix for chartiq's AMD module
             */
            // { parser: {  amd: false  } },
            {
                test: /\.(js|jsx)$/,
                exclude: [/node_modules/, /\\scripts/, /main\.dart\.js$/, /flutter\.js$/, /main\.dart\.mjs$/, /.*\.smartcharts\.js$/],
                loader: 'eslint-loader',
                enforce: 'pre',
                options: { fix: true },
            },
            {
                test: /\.(js|jsx|ts|tsx)$/,
                // exclude: /node_modules/,
                loader: 'babel-loader',
            },
            {
                include: path.resolve(__dirname, 'src/utils/ga.js'),
                use: [
                    {
                        loader: path.resolve('./loaders/exclude-block-loader.js'),
                        options: {
                            start: `@START-EXCLUDE: '${BUILD_MODE}'`,
                            end: '@END-EXCLUDE',
                        },
                    },
                ],
            },
        ],
    },
    plugins: [
        new webpack.ProvidePlugin({
            React: 'react', // Automatically provide React variable
        }),
        new MiniCssExtractPlugin({ filename: 'smartcharts.css' }),
        new StyleLintPlugin(),
        new SpriteLoaderPlugin(),
        new CopyWebpackPlugin({
            patterns: [
                // Copy Flutter assets to root level (where Flutter expects them)
                {
                    from: './chart_app/build/web/assets',
                    to: './assets',
                },
                // Copy other Flutter files to chart directory (excluding assets)
                {
                    from: './chart_app/build/web',
                    to: './chart',
                    globOptions: {
                        ignore: ['**/packages/**', '**/assets/**'],
                    },
                },
            ],
        }),
        new ForkTsCheckerWebpackPlugin(),
    ],
    // Externals configuration - library mode externalizes all deps
    // App mode will override this to bundle mobx-react-lite (avoids UMD shim issues)
    externals: {
        react: {
            root: 'React',
            commonjs: 'react',
            commonjs2: 'react',
        },
        'react/jsx-runtime': {
            commonjs: 'react/jsx-runtime',
            commonjs2: 'react/jsx-runtime',
            root: ['React'],
        },
        'react/jsx-dev-runtime': {
            commonjs: 'react/jsx-dev-runtime',
            commonjs2: 'react/jsx-dev-runtime',
            root: ['React'],
        },
        'react-dom': {
            commonjs: 'react-dom',
            commonjs2: 'react-dom',
            root: 'ReactDOM',
        },
        'babel-polyfill': 'babel-polyfill',
        'react-transition-group': {
            commonjs: 'react-transition-group',
            commonjs2: 'react-transition-group',
            root: 'ReactTransitionGroup',
        },
        dayjs: {
            root: 'dayjs',
            commonjs: 'dayjs',
            commonjs2: 'dayjs',
        },
        mobx: {
            root: 'mobx',
            commonjs: 'mobx',
            commonjs2: 'mobx',
        },
        'mobx-react-lite': {
            root: 'mobxReactLite',
            commonjs: 'mobx-react-lite',
            commonjs2: 'mobx-react-lite',
        },
        '@deriv-com/quill-ui': {
            root: 'QuillUI',
            commonjs: '@deriv-com/quill-ui',
            commonjs2: '@deriv-com/quill-ui',
        },
    },
};

if (production) {
    config.plugins.push(
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify('production'),
            },
        })
    );

    // Add production optimizations
    config.optimization = {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false, // Keep console for library usage
                        drop_debugger: true,
                        pure_funcs: ['console.debug'], // Remove only debug logs
                    },
                    mangle: true,
                    output: {
                        comments: false,
                    },
                },
                extractComments: false,
            }),
            new CssMinimizerPlugin(),
        ],
        splitChunks: {
            chunks: 'async', // Only split async chunks to maintain UMD compatibility
            minSize: 20000, // Minimum size for a chunk (20KB)
            maxSize: 244000, // Split chunks larger than ~240KB
            cacheGroups: {
                // Split html2canvas into its own chunk (already lazy-loaded)
                html2canvas: {
                    test: /[\\/]node_modules[\\/]html2canvas[\\/]/,
                    name: 'html2canvas',
                    chunks: 'async',
                    priority: 15,
                },
                // Split lz-string into its own chunk (lazy-loaded in ChartState.ts)
                lzstring: {
                    test: /[\\/]node_modules[\\/]lz-string[\\/]/,
                    name: 'lz-string',
                    chunks: 'async',
                    priority: 15,
                },
                // Split resize-observer-polyfill (lazy-loaded in ChartStore.ts)
                resizeObserver: {
                    test: /[\\/]node_modules[\\/]resize-observer-polyfill[\\/]/,
                    name: 'resize-observer-polyfill',
                    chunks: 'async',
                    priority: 15,
                },
                // Split classnames utility (used across components)
                classnames: {
                    test: /[\\/]node_modules[\\/]classnames[\\/]/,
                    name: 'classnames',
                    chunks: 'async',
                    priority: 10,
                    minSize: 0,
                },
                // Split lodash-es utilities if used
                lodash: {
                    test: /[\\/]node_modules[\\/]lodash-es[\\/]/,
                    name: 'lodash-es',
                    chunks: 'async',
                    priority: 10,
                },
                // Note: StudyLegendStore and DrawToolsStore are synchronously imported
                // in MainStore, so they cannot be split without refactoring to lazy-load.
                // Consider lazy-loading these stores in the future for further optimization.
            },
        },
        concatenateModules: true, // Enable module concatenation (scope hoisting)
        usedExports: true, // Enable tree shaking
        sideEffects: true, // Respect package.json sideEffects field
    };
}

if (process.env.ANALYZE_BUNDLE) {
    config.plugins.push(new BundleAnalyzerPlugin());
}

if (isApp) {
    config.entry = path.resolve(__dirname, `./app/${appEntryFile}.tsx`);

    // Remove mobx-react-lite from externals in app mode
    // This lets webpack bundle it with its use-sync-external-store dependency
    // avoiding the UMD shim compatibility issue with React 18
    delete config.externals['mobx-react-lite'];

    // Quill ships no UMD build, so the sample app has no global to bind to.
    // Bundle it instead — the library build keeps it external.
    // (quill-icons needs no entry here: it is bundled in both modes.)
    delete config.externals['@deriv-com/quill-ui'];

    config.plugins.push(
        new CopyWebpackPlugin({
            patterns: [
                { from: './sass/favicons/*.png' },
                { from: './node_modules/@babel/polyfill/dist/polyfill.min.js', to: 'babel-polyfill.min.js' },
                { from: './app/assets/*.svg' },
                { from: './nojs-smartcharts.css' },
                {
                    from: production
                        ? './node_modules/react/umd/react.production.min.js'
                        : './node_modules/react/umd/react.development.js',
                    to: 'react.js',
                },
                {
                    from: production
                        ? './node_modules/react-dom/umd/react-dom.production.min.js'
                        : './node_modules/react-dom/umd/react-dom.development.js',
                    to: 'react-dom.js',
                },
                {
                    from: production
                        ? './node_modules/mobx/dist/mobx.umd.production.min.js'
                        : './node_modules/mobx/dist/mobx.umd.development.js',
                    to: 'mobx.js',
                },
                // mobx-react-lite UMD removed - now bundled by webpack to avoid
                // use-sync-external-store shim compatibility issues with React 18
                {
                    from: './node_modules/react-transition-group/dist/react-transition-group.js',
                    to: 'react-transition-group.js',
                },
                {
                    from: production
                        ? './node_modules/dayjs/dayjs.min.js'
                        : './node_modules/dayjs/dayjs.min.js',
                    to: 'dayjs.js',
                },
                {
                    from: './node_modules/dayjs/plugin/utc.js',
                    to: 'dayjs-plugin-utc.js',
                },
            ],
        })
    );
}

module.exports = config;
