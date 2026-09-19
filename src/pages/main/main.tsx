// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React, { lazy, Suspense, useEffect, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation, useNavigate } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateOAuthURL } from '@/components/shared';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import Dialog from '@/components/shared_ui/dialog';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradeTypeConfirmationModal from '@/components/trade-type-confirmation-modal';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import { DBOT_TABS, TAB_IDS } from '@/constants/bot-contents';
import { api_base, updateWorkspaceName } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { prefetchAllTabsWhenIdle } from '@/utils/prefetch-tabs';
import {
    disableUrlParameterApplication,
    enableUrlParameterApplication,
    setupTradeTypeChangeListener,
} from '@/utils/blockly-url-param-handler';
import {
    checkAndShowTradeTypeModal,
    getModalState,
    handleTradeTypeCancel,
    handleTradeTypeConfirm,
    resetUrlParamProcessing,
    setModalStateChangeCallback,
} from '@/utils/trade-type-modal-handler';
import {
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedObjectsColumnCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionBoldIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyGuide1pxIcon } from '@deriv/quill-icons/Legacy';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import './main.scss';

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));
const Tutorial = lazy(() => import('../tutorials'));
const EpmTradingBots = lazy(() => import('../epm-trading-bots'));
const DtraderPage = lazy(() => import('../dtrader'));

const AppWrapper = observer(() => {
    const { connectionStatus } = useApiBase();
    const { chart_store, dashboard, load_modal, run_panel, quick_strategy, summary_card, blockly_store } =
        useStore();
    const { is_loading } = blockly_store;
    const {
        active_tab,
        active_tour,
        is_chart_modal_visible,
        is_trading_view_modal_visible,
        setActiveTab,
        setWebSocketState,
        setActiveTour,
        setTourDialogVisibility,
    } = dashboard;
    const { dashboard_strategies } = load_modal;
    const {
        is_dialog_open,
        is_drawer_open,
        dialog_options,
        onCancelButtonClick,
        onCloseDialog,
        onOkButtonClick,
        stopBot,
    } = run_panel;
    const { is_open } = quick_strategy;
    const { cancel_button_text, ok_button_text, title, message, dismissable, is_closed_on_cancel } = dialog_options as {
        [key: string]: string;
    };
    const { clear } = summary_card;
    const { DASHBOARD, BOT_BUILDER } = DBOT_TABS;
    const init_render = React.useRef(true);
    const hash = ['dashboard', 'bot_builder', 'chart', 'dtrader', 'tutorial', 'epm_trading_bots'];
    const { isDesktop } = useDevice();
    const location = useLocation();
    const navigate = useNavigate();
    const [left_tab_shadow, setLeftTabShadow] = useState<boolean>(false);
    const [right_tab_shadow, setRightTabShadow] = useState<boolean>(false);
    // Safety net for the Charts-preload gate below: if is_chart_loading
    // never becomes true (a slow connection, a network hiccup, some edge
    // case in the chart library), this forces the page to show anyway
    // after 8s instead of leaving the spinner up forever.
    const [charts_preload_timed_out, setChartsPreloadTimedOut] = useState(false);

    // Embed mode used by the ExecutivePrimeMarkets "Trading Courses" page: when
    // this app is loaded there, the URL carries ?embed=tutorial-only alongside
    // the #tutorial hash. When present, we hide this app's own top tab bar and
    // the Run/Bot-status panel, showing only the Tutorials content itself.
    // The plain /botbuilder route (no query flag) is completely unaffected.
    const search_params = new URLSearchParams(location.search);
    const is_tutorial_only_embed = search_params.get('embed') === 'tutorial-only';
    // True only when this app is loaded inside another site's iframe (e.g.
    // the ExecutivePrimeMarkets dashboard, which renders its own header row
    // with save/star/share/avatar icons directly above this iframe). The
    // plain standalone /botbuilder route (opened directly, not in an
    // iframe) has no such overlapping header, so it must NOT get the extra
    // top clearance below — applying it there just wastes space and breaks
    // each tab's own height calculations.
    const is_embedded_in_parent = typeof window !== 'undefined' && window.self !== window.top;

    // Trade type modal state
    const [tradeTypeModalState, setTradeTypeModalState] = useState(getModalState());

    /**
     * Helper function to get modal props with enhanced type safety and clear documentation
     *
     * Props serve distinct purposes:
     * - current_trade_type: Technical identifier for API/internal use (format: "category/type")
     * - current_trade_type_display_name: Human-readable name for UI display
     *
     * This separation ensures proper data flow between technical systems and user interface
     */
    const getTradeTypeModalProps = () => {
        const { tradeTypeData } = tradeTypeModalState;

        return {
            is_visible: tradeTypeModalState.isVisible,
            trade_type_display_name: tradeTypeData?.displayName || '',

            // Technical identifier for internal/API use (e.g., "callput/callput")
            // Used by backend systems and technical integrations
            current_trade_type: tradeTypeData?.currentTradeType
                ? `${tradeTypeData.currentTradeType.tradeTypeCategory}/${tradeTypeData.currentTradeType.tradeType}`
                : 'N/A',

            // Human-readable display name for UI (e.g., "Rise/Fall")
            // Used for user-facing text and modal content
            current_trade_type_display_name: tradeTypeData?.currentTradeTypeDisplayName || 'N/A',

            onConfirm: handleTradeTypeConfirm,
            onCancel: handleTradeTypeCancel,
        };
    };

    // App Builder embeds the bot at /bot/preview — open the bot builder there by
    // default (instead of the dashboard) when no explicit #tab hash is present.
    const is_preview_mode = window.location.pathname.includes('/preview');
    let tab_value: number | string = active_tab;
    const GetHashedValue = (tab: number) => {
        tab_value = location.hash?.split('#')[1];
        if (!tab_value) return is_preview_mode ? BOT_BUILDER : tab;
        return Number(hash.indexOf(String(tab_value)));
    };
    const active_hash_tab = GetHashedValue(active_tab);

    // Set up modal state change listener
    React.useEffect(() => {
        setModalStateChangeCallback(new_state => {
            setTradeTypeModalState(new_state);
        });
    }, [is_loading]);

    // Reset URL parameter processing when location changes
    React.useEffect(() => {
        resetUrlParamProcessing();
    }, [location.search]);

    // Warm the lazy tab chunks in the background once the app is idle
    React.useEffect(() => {
        prefetchAllTabsWhenIdle();
    }, []);

    // Safety net for the Charts-preload gate: force the page to show after
    // 8s even if is_chart_loading never fires, so a rare failure can't
    // permanently block someone from seeing their page.
    React.useEffect(() => {
        const timer = setTimeout(() => setChartsPreloadTimedOut(true), 8000);
        return () => clearTimeout(timer);
    }, []);

    React.useEffect(() => {
        const el_dashboard = document.getElementById('id-dbot-dashboard');
        const el_tutorial = document.getElementById('id-tutorials');

        const observer_dashboard = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setLeftTabShadow(false);
                    return;
                }
                setLeftTabShadow(true);
            },
            {
                root: null,
                threshold: 0.5, // set offset 0.1 means trigger if atleast 10% of element in viewport
            }
        );

        const observer_tutorial = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setRightTabShadow(false);
                    return;
                }
                setRightTabShadow(true);
            },
            {
                root: null,
                threshold: 0.5, // set offset 0.1 means trigger if atleast 10% of element in viewport
            }
        );
        // During the Charts-preload phase (see below), Tabs isn't rendered
        // yet, so these elements don't exist -- getElementById returns
        // null, and .observe(null) throws a TypeError that was crashing
        // the whole app via the error boundary. Guard against that.
        if (el_dashboard) observer_dashboard.observe(el_dashboard);
        if (el_tutorial) observer_tutorial.observe(el_tutorial);
    });

    React.useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    // Update tab shadows height to match bot builder height
    const updateTabShadowsHeight = () => {
        const botBuilderEl = document.getElementById('id-bot-builder');
        const leftShadow = document.querySelector('.tabs-shadow--left') as HTMLElement;
        const rightShadow = document.querySelector('.tabs-shadow--right') as HTMLElement;

        if (botBuilderEl && leftShadow && rightShadow) {
            const height = botBuilderEl.offsetHeight;
            leftShadow.style.height = `${height}px`;
            rightShadow.style.height = `${height}px`;
        }
    };

    React.useEffect(() => {
        let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

        // Handle URL trade type parameters when switching to Bot Builder tab
        if (active_tab === BOT_BUILDER) {
            // Use requestAnimationFrame to ensure Blockly workspace is fully initialized
            requestAnimationFrame(() => {
                // Disable automatic URL parameter application to prevent changes before modal
                disableUrlParameterApplication();

                // Set up listener for manual trade type changes (only once)
                setupTradeTypeChangeListener();

                // Create unified handler for both immediate and delayed execution
                const handleTradeTypeModal = () => {
                    checkAndShowTradeTypeModal(
                        // onConfirm: Changes are now handled by the modal component
                        () => {
                            // Re-enable URL parameter application for future parameters
                            enableUrlParameterApplication();
                        },
                        // onCancel: URL parameter removal is now handled by the modal component
                        () => {}
                    );
                };

                // Wait for Blockly to finish loading before checking for URL parameters
                if (!blockly_store.is_loading) {
                    // Blockly is loaded, but add longer delay to ensure workspace is fully initialized
                    // and trade type fields are populated
                    setTimeout(() => {
                        handleTradeTypeModal();
                    }, 500);
                } else {
                    // Blockly is still loading, wait for it to finish with optimized polling
                    let pollAttempts = 0;
                    const maxPollAttempts = 10; // Maximum 5 seconds (10 * 500ms) - optimized performance

                    const checkBlocklyLoaded = () => {
                        if (!blockly_store.is_loading) {
                            handleTradeTypeModal();
                            return; // Exit polling once loaded
                        }

                        if (pollAttempts < maxPollAttempts) {
                            pollAttempts++;
                            // Use 500ms intervals for better performance (5x improvement from 100ms)
                            pollTimeoutId = setTimeout(checkBlocklyLoaded, 500);
                        } else {
                            console.warn(
                                'Blockly loading timeout after 5 seconds - proceeding without URL parameter check'
                            );
                        }
                    };

                    checkBlocklyLoaded();
                }
            });
        }

        // Cleanup function to prevent memory leaks
        return () => {
            if (pollTimeoutId) {
                clearTimeout(pollTimeoutId);
                pollTimeoutId = null;
            }
        };
    }, [active_tab, is_loading]);

    React.useEffect(() => {
        // Run on mount and when active tab changes
        updateTabShadowsHeight();

        if (is_open) {
            setTourDialogVisibility(false);
        }
        if (init_render.current) {
            setActiveTab(Number(active_hash_tab));
            if (!isDesktop) handleTabChange(Number(active_hash_tab));
            init_render.current = false;
        } else {
            // Preserve URL parameters when navigating
            const currentSearch = window.location.search;
            navigate(`${currentSearch}#${hash[active_tab] || hash[0]}`);
        }
        if (active_tour !== '') {
            setActiveTour('');
        }

        // Prevent scrolling when tutorial tab is active (only on mobile)
        const mainElement = document.querySelector('.main__container');
        if (active_tab === DBOT_TABS.TUTORIAL && !isDesktop) {
            document.body.style.overflow = 'hidden';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.add('no-scroll');
            }
        } else {
            document.body.style.overflow = '';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.remove('no-scroll');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab]);

    React.useEffect(() => {
        const trashcan_init_id = setTimeout(() => {
            if (active_tab === BOT_BUILDER && Blockly?.derivWorkspace?.trashcan) {
                const trashcanY = window.innerHeight - 250;
                let trashcanX;
                if (is_drawer_open) {
                    trashcanX = isDbotRTL() ? 380 : window.innerWidth - 460;
                } else {
                    trashcanX = isDbotRTL() ? 20 : window.innerWidth - 100;
                }
                Blockly?.derivWorkspace?.trashcan?.setTrashcanPosition(trashcanX, trashcanY);
            }
        }, 100);

        return () => {
            clearTimeout(trashcan_init_id); // Clear the timeout on unmount
        };
        //eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab, is_drawer_open]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (dashboard_strategies.length > 0) {
            // Needed to pass this to the Callback Queue as on tab changes
            // document title getting override by 'Bot | Deriv' only
            timer = setTimeout(() => {
                updateWorkspaceName();
            });
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [dashboard_strategies, active_tab]);

    const handleTabChange = React.useCallback(
        (tab_index: number) => {
            setActiveTab(tab_index);
            const el_id = TAB_IDS[tab_index];
            if (el_id) {
                const el_tab = document.getElementById(el_id);
                setTimeout(() => {
                    el_tab?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }, 10);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [active_tab]
    );

    // [AI]
    const handleLoginGeneration = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        } else {
            console.error('Failed to generate OAuth URL');
        }
    };
    // [/AI]
    return (
        <React.Fragment>
            <div className='main'>
                <div
                    className={classNames('main__container', {
                        'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop,
                        'main__container--hide-tabs': is_tutorial_only_embed,
                        'main__container--embedded-header': is_embedded_in_parent,
                    })}
                >
                    <div>
                        {/* Charts and Dtrader share the same underlying chart
                            engine (SmartCharts' CanvasKit/WASM bundle, tens of
                            MB on a cold cache). Loading Charts fully first and
                            only then revealing whatever page the person
                            actually asked for means that shared engine is
                            already cached by the time a chart-using tab like
                            Dtrader needs it -- so every subsequent page opens
                            fast, deliberately at the cost of a single upfront
                            wait on first load/refresh, on every tab, not just
                            Charts. This is intentional, not a loading bug. */}
                        {chart_store.is_chart_loading ||
                        charts_preload_timed_out ||
                        active_tab === DBOT_TABS.CHART ? (
                            <>
                                {!isDesktop && left_tab_shadow && <span className='tabs-shadow tabs-shadow--left' />}{' '}
                                {/* The tab list itself now renders in the header (via MenuItems) on
                                    desktop, so there's one combined header instead of two stacked
                                    bars. Mobile has no room there, so it keeps its own row here. */}
                                <Tabs
                            active_index={active_tab}
                            className='main__tabs'
                            onTabItemClick={handleTabChange}
                            hide_list={isDesktop}
                            // Without this, Tabs forces every tab into a fixed
                            // 100%/tab-count width (~16.67% for 6 tabs) rather
                            // than sizing to its own label. Labels like "EPM
                            // Trading bots" don't fit that box and, since text
                            // stays nowrap, overflow into the neighbouring
                            // tabs -- the jumbled/overlapping look on mobile.
                            // Scrollable mode sizes each tab to its content and
                            // scrolls the row instead, matching the shadow
                            // affordances already built for this tab bar.
                            is_scrollable={!isDesktop}
                            top
                        >
                            <div
                                label={
                                    <>
                                        <LabelPairedObjectsColumnCaptionRegularIcon
                                            height='18px'
                                            width='18px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='Dashboard' />
                                    </>
                                }
                                id='id-dbot-dashboard'
                            >
                                <Dashboard handleTabChange={handleTabChange} />
                            </div>
                            <div
                                label={
                                    <>
                                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                                            height='18px'
                                            width='18px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='Bot Builder' />
                                    </>
                                }
                                id='id-bot-builder'
                            />
                            <div
                                label={
                                    <>
                                        <LabelPairedChartLineCaptionRegularIcon
                                            height='18px'
                                            width='18px'
                                            fill='var(--text-general)'
                                        />
                                        <Localize i18n_default_text='Charts' />
                                    </>
                                }
                                id={
                                    is_chart_modal_visible || is_trading_view_modal_visible
                                        ? 'id-charts--disabled'
                                        : 'id-charts'
                                }
                            >
                                <Suspense
                                    fallback={<ChunkLoader message={localize('Please wait, loading chart...')} />}
                                >
                                    <ChartWrapper show_digits_stats={false} />
                                </Suspense>
                            </div>
                            <div
                                label={
                                    <>
                                        <span style={{ fontSize: '15px', lineHeight: 1 }}>📈</span>
                                        <Localize i18n_default_text='Dtrader' />
                                    </>
                                }
                                id='id-dtrader'
                                // .dtrader-app (dtrader/index.tsx) is 'h-full',
                                // meant to fill this panel, but a plain block
                                // child doesn't inherit height from its parent
                                // without an explicit value here -- it just
                                // shrinks to its own content. .dc-tabs__content
                                // itself does have a real height (main.scss),
                                // but that never reached .dtrader-app without
                                // this. Trade types with a taller automated
                                // panel (Rise/Fall) filled the space by
                                // coincidence; shorter ones (Accumulators,
                                // Matches/Differs, Over/Under, Even/Odd) left
                                // .dc-tabs__content's own background exposed
                                // below -- the black block underneath them.
                                style={{ height: '100%' }}
                            >
                                <Suspense
                                    fallback={<ChunkLoader message={localize('Please wait, loading Dtrader...')} />}
                                >
                                    <DtraderPage />
                                </Suspense>
                            </div>
                            <div
                                label={
                                    <>
                                        <LegacyGuide1pxIcon
                                            height='12px'
                                            width='12px'
                                            fill='var(--text-general)'
                                            className='icon-general-fill-g-path'
                                        />
                                        <Localize i18n_default_text='Tutorials' />
                                    </>
                                }
                                id='id-tutorials'
                            >
                                <div className='tutorials-wrapper'>
                                    <Suspense
                                        fallback={
                                            <ChunkLoader message={localize('Please wait, loading tutorials...')} />
                                        }
                                    >
                                        <Tutorial handleTabChange={handleTabChange} />
                                    </Suspense>
                                </div>
                            </div>
                            <div
                                label={
                                    <>
                                        <span style={{ fontSize: '15px', lineHeight: 1 }}>🤖</span>
                                        <Localize i18n_default_text='EPM Trading bots' />
                                    </>
                                }
                                id='id-epm-trading-bots'
                            >
                                <Suspense
                                    fallback={
                                        <ChunkLoader
                                            message={localize('Please wait, loading EPM Trading bots...')}
                                        />
                                    }
                                >
                                    <EpmTradingBots />
                                </Suspense>
                            </div>
                        </Tabs>
                                {!isDesktop && right_tab_shadow && (
                                    <span className='tabs-shadow tabs-shadow--right' />
                                )}{' '}
                            </>
                        ) : (
                            <ChunkLoader message={localize('Please wait, loading...')} />
                        )}
                        {/* Hidden Charts preload: mounted immediately on every
                            app load/refresh, regardless of active_tab, so its
                            chunk + chart engine start downloading right away
                            rather than waiting for someone to actually open
                            Charts. Skipped when Charts is already the visible
                            active tab above -- that already covers loading it,
                            and a second simultaneous instance would fight the
                            first over the same shared chart_store state (symbol,
                            granularity, tick subscriptions). Off-screen, not
                            display:none -- some chart libraries need real
                            layout dimensions to initialize correctly. */}
                        {active_tab !== DBOT_TABS.CHART && !chart_store.is_chart_loading && (
                            <div
                                style={{
                                    position: 'fixed',
                                    top: '-9999px',
                                    left: '-9999px',
                                    width: '1px',
                                    height: '1px',
                                    overflow: 'hidden',
                                    pointerEvents: 'none',
                                }}
                                aria-hidden='true'
                            >
                                <Suspense fallback={null}>
                                    <ChartWrapper show_digits_stats={false} />
                                </Suspense>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <DesktopWrapper>
                {/* Never rendered at all while dtrader is active — not just
                    hidden by CSS. It was never actually hidden there before;
                    it just happened to be visually covered once dtrader's
                    own chart UI finished loading, which is exactly why it
                    flashed visible during dtrader's loading gap. A real
                    condition here removes it from the DOM outright, so
                    there's nothing to flash regardless of timing. */}
                {!is_tutorial_only_embed && active_tab !== DBOT_TABS.DTRADER && (
                    <div className='main__run-strategy-wrapper'>
                        <RunStrategy />
                        <RunPanel />
                    </div>
                )}
                <ChartModal />
                <TradingViewModal />
            </DesktopWrapper>
            <MobileWrapper>
                {!is_tutorial_only_embed && !is_open && active_tab !== DBOT_TABS.DTRADER && <RunPanel />}
            </MobileWrapper>
            <Dialog
                cancel_button_text={cancel_button_text || localize('Cancel')}
                className='dc-dialog__wrapper--fixed'
                confirm_button_text={ok_button_text || localize('Ok')}
                has_close_icon
                is_mobile_full_width={false}
                is_visible={is_dialog_open}
                onCancel={onCancelButtonClick}
                onClose={onCloseDialog}
                onConfirm={onOkButtonClick || onCloseDialog}
                portal_element_id='modal_root'
                title={title}
                login={handleLoginGeneration}
                dismissable={dismissable} // Prevents closing on outside clicks
                is_closed_on_cancel={is_closed_on_cancel}
            >
                {message}
            </Dialog>

            {/* Trade Type Confirmation Modal */}
            {(() => {
                const modalProps = getTradeTypeModalProps();
                return (
                    <TradeTypeConfirmationModal
                        is_visible={modalProps.is_visible}
                        trade_type_display_name={modalProps.trade_type_display_name}
                        current_trade_type={modalProps.current_trade_type}
                        current_trade_type_display_name={modalProps.current_trade_type_display_name}
                        onConfirm={modalProps.onConfirm}
                        onCancel={modalProps.onCancel}
                    />
                );
            })()}
        </React.Fragment>
    );
});

export default AppWrapper;
