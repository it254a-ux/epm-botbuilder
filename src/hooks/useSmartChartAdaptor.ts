import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSmartchartsChampionAdapter } from '@/adapters/smartcharts-champion';
import { createServices } from '@/adapters/smartcharts-champion/services';
import { createTransport } from '@/adapters/smartcharts-champion/transport';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import type { SmartchartsChampionAdapter } from '@/types/smartchart.types';
import type {
    ActiveSymbols,
    TGetQuotes,
    TGranularity,
    TradingTimesMap,
    TSubscribeQuotes,
    TUnsubscribeQuotes,
} from '@deriv-com/smartcharts-champion';

// Logger utility
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Hook]'),
    error: console.error.bind(console, '[SmartCharts Hook]'),
};

// Type guard for valid granularity values
function isValidGranularity(value: unknown): value is TGranularity {
    const validGranularities = [0, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400];
    return typeof value === 'number' && validGranularities.includes(value);
}

interface UseSmartChartAdaptorReturn {
    adapter: SmartchartsChampionAdapter | null;
    adapterInitialized: boolean;
    chartData: {
        activeSymbols: ActiveSymbols;
        tradingTimes: TradingTimesMap;
    };
    getQuotes: TGetQuotes;
    subscribeQuotes: TSubscribeQuotes;
    unsubscribeQuotes: TUnsubscribeQuotes;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Custom hook for SmartChart Adaptor
 * Handles adapter initialization, data fetching, and subscription management
 * with proper memoization and memory leak prevention
 */
export const useSmartChartAdaptor = (): UseSmartChartAdaptorReturn => {
    // State management
    const [adapter, setAdapter] = useState<SmartchartsChampionAdapter | null>(null);
    const [adapterInitialized, setAdapterInitialized] = useState(false);
    const [chartData, setChartData] = useState<{
        activeSymbols: ActiveSymbols;
        tradingTimes: TradingTimesMap;
    }>({
        activeSymbols: [] as ActiveSymbols,
        tradingTimes: {} as TradingTimesMap,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Refs to track mounted state and prevent memory leaks
    const isMountedRef = useRef(true);
    const cleanupFunctionsRef = useRef<Array<() => void>>([]);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to store timeout for cleanup

    // Track mounted state
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, []);

    // Initialize adapter — waits for chart_api.api to become ready.
    //
    // chart_api.api is a plain mutable property, not something React can
    // watch via a dependency array. Poll for it instead of checking once.
    //
    // This component (and its parent tab) stays mounted for the lifetime of
    // the app — every tab mounts up front for instant switching, it doesn't
    // remount when you navigate to/away from Charts. That makes a permanent,
    // terminal failure here dangerous: if chart_api.api happens to still be
    // null after the first few seconds (e.g. because another tab, such as
    // Dtrader, is doing its own heavy initial work on the same shared
    // connection at the same time), giving up for good would leave the
    // chart broken for the rest of the session, recoverable only by a full
    // page reload — even though the shared connection goes on to become
    // ready moments later. So: poll quickly at first, then fall back to a
    // slower indefinite poll rather than ever setting a terminal error for
    // this specific condition. A genuinely broken connection (e.g. auth
    // failing outright) surfaces elsewhere in the app already.
    useEffect(() => {
        if (adapterInitialized) return;

        let cancelled = false;
        let attempts = 0;
        const fastAttempts = 25; // 25 x 200ms = 5s of quick polling
        const fastIntervalMs = 200;
        const slowIntervalMs = 2000; // then keep checking every 2s, indefinitely
        let pollTimeout: ReturnType<typeof setTimeout> | null = null;

        const tryInit = () => {
            if (cancelled) return;

            if (!chart_api.api) {
                attempts += 1;
                const nextDelay = attempts < fastAttempts ? fastIntervalMs : slowIntervalMs;
                pollTimeout = setTimeout(tryInit, nextDelay);
                return;
            }

            try {
                const transport = createTransport();
                const services = createServices();
                const championAdapter = buildSmartchartsChampionAdapter(transport, services, {
                    debug: true,
                    subscriptionTimeout: 30000,
                });

                if (isMountedRef.current) {
                    setAdapter(championAdapter);
                    setAdapterInitialized(true);
                    setError(null);
                }
            } catch (err) {
                if (isMountedRef.current) {
                    setError(err instanceof Error ? err : new Error('Failed to initialize adapter'));
                    setIsLoading(false);
                }
            }
        };

        tryInit();

        return () => {
            cancelled = true;
            if (pollTimeout) clearTimeout(pollTimeout);
        };
    }, [adapterInitialized]);

    // Load chart data when adapter is initialized
    useEffect(() => {
        if (!adapter || !adapterInitialized) return;

        let cancelled = false;

        const loadChartData = async (retryCount = 0, maxRetries = 10, delayMs = 200) => {
            try {
                setIsLoading(true);
                const data = await adapter.getChartData();

                if (!cancelled && isMountedRef.current) {
                    // Check if activeSymbols is empty and we have retries left
                    if (data.activeSymbols.length === 0 && retryCount < maxRetries) {
                        // Clear any existing timeout
                        if (retryTimeoutRef.current) {
                            clearTimeout(retryTimeoutRef.current);
                        }

                        // Wait for the specified delay before retrying
                        retryTimeoutRef.current = setTimeout(() => {
                            if (!cancelled && isMountedRef.current) {
                                loadChartData(retryCount + 1, maxRetries, delayMs);
                            }
                        }, delayMs);

                        return;
                    }

                    setChartData({
                        activeSymbols: data.activeSymbols,
                        tradingTimes: data.tradingTimes,
                    });
                    setError(null);
                }
            } catch (err) {
                // If we have retries left, try again
                if (!cancelled && isMountedRef.current && retryCount < maxRetries) {
                    // Clear any existing timeout
                    if (retryTimeoutRef.current) {
                        clearTimeout(retryTimeoutRef.current);
                    }

                    retryTimeoutRef.current = setTimeout(() => {
                        if (!cancelled && isMountedRef.current) {
                            loadChartData(retryCount + 1, maxRetries, delayMs);
                        }
                    }, delayMs);

                    return;
                }

                if (!cancelled && isMountedRef.current) {
                    setError(err instanceof Error ? err : new Error('Failed to load chart data'));
                    // Set fallback data to prevent undefined
                    setChartData({
                        activeSymbols: [] as ActiveSymbols,
                        tradingTimes: {} as TradingTimesMap,
                    });
                }
            } finally {
                if (!cancelled && isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        };

        loadChartData();

        // Cleanup function to cancel async operations
        return () => {
            cancelled = true;

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [adapter, adapterInitialized]);

    // Memoized getQuotes function
    const getQuotes: TGetQuotes = useCallback(
        async params => {
            if (!adapter) {
                throw new Error('Adapter not initialized');
            }

            const result = await adapter.getQuotes({
                symbol: params.symbol,
                granularity: isValidGranularity(params.granularity) ? params.granularity : 0,
                count: params.count,
                start: params.start,
                end: params.end,
            });

            // Transform adapter result to SmartCharts Champion format
            if (params.granularity === 0) {
                // For ticks, return history format
                return {
                    history: {
                        prices: result.quotes.map(q => q.Close),
                        times: result.quotes.map(q => parseInt(q.Date)),
                    },
                };
            } else {
                // For candles, return candles format
                return {
                    candles: result.quotes.map(q => ({
                        open: q.Open || q.Close,
                        high: q.High || q.Close,
                        low: q.Low || q.Close,
                        close: q.Close,
                        epoch: parseInt(q.Date),
                    })),
                };
            }
        },
        [adapter]
    );

    // Memoized subscribeQuotes function
    const subscribeQuotes: TSubscribeQuotes = useCallback(
        (params, callback) => {
            if (!adapter) {
                return () => {};
            }

            const unsubscribe = adapter.subscribeQuotes(
                {
                    symbol: params.symbol,
                    granularity: isValidGranularity(params.granularity) ? params.granularity : 0,
                },
                quote => {
                    if (isMountedRef.current) {
                        callback(quote);
                    }
                }
            );

            // Create wrapper BEFORE storing/returning to avoid race condition
            const wrappedUnsubscribe = () => {
                unsubscribe();
                const index = cleanupFunctionsRef.current.indexOf(wrappedUnsubscribe);
                if (index > -1) {
                    cleanupFunctionsRef.current.splice(index, 1);
                }
            };

            // Store BEFORE returning to avoid race condition
            cleanupFunctionsRef.current.push(wrappedUnsubscribe);

            return wrappedUnsubscribe;
        },
        [adapter]
    );

    // Memoized unsubscribeQuotes function
    const unsubscribeQuotes: TUnsubscribeQuotes = useCallback(
        request => {
            if (adapter) {
                // If we have request details, use the adapter's unsubscribe method
                if (request?.symbol && typeof request.granularity !== 'undefined') {
                    adapter.unsubscribeQuotes({
                        symbol: request.symbol,
                        granularity: isValidGranularity(request.granularity) ? request.granularity : 0,
                    });
                } else {
                    // Fallback: unsubscribe all via transport
                    adapter.transport.unsubscribeAll('ticks');
                }
            }
        },
        [adapter]
    );

    // Cleanup effect - runs on unmount
    useEffect(() => {
        return () => {
            // Execute all cleanup functions
            cleanupFunctionsRef.current.forEach(cleanup => {
                try {
                    cleanup();
                } catch (err) {
                    logger.error('Error during cleanup:', err);
                }
            });
            cleanupFunctionsRef.current = [];

            // Unsubscribe from all ticks
            try {
                chart_api.api?.forgetAll('ticks');
            } catch (err) {
                logger.error('Error forgetting ticks:', err);
            }

            // Clean up adapter subscriptions
            if (adapter?.transport) {
                try {
                    adapter.transport.unsubscribeAll('ticks');
                } catch (err) {
                    logger.error('Error unsubscribing from adapter:', err);
                }
            }

            // Clear any pending retry timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [adapter]);

    // Return object without useMemo wrapper (callbacks are already memoized)
    return {
        adapter,
        adapterInitialized,
        chartData,
        getQuotes,
        subscribeQuotes,
        unsubscribeQuotes,
        isLoading,
        error,
    };
};
