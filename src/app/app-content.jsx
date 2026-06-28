import React, { lazy, Suspense, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ToastContainer } from 'react-toastify';
import AuthLoadingWrapper from '@/components/auth-loading-wrapper';
import { botNotification } from '@/components/bot-notification/bot-notification';
import useLiveChat from '@/components/chat/useLiveChat';
import ChunkLoader from '@/components/loader/chunk-loader';
import { getUrlBase } from '@/components/shared';
import TransactionDetailsModal from '@/components/transaction-details';
import { api_base, ApiHelpers, ServerTime } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import useDevMode from '@/hooks/useDevMode';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { isPreviewMode } from '@/utils/is-preview-mode';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { setSmartChartsPublicPath } from '@deriv-com/smartcharts-champion';
import { localize } from '@deriv-com/translations';
import Audio from '../components/audio';
import BlocklyLoading from '../components/blockly-loading';
import BotStopped from '../components/bot-stopped';
import BotBuilder from '../pages/bot-builder';
import Main from '../pages/main';
import './app.scss';
import 'react-toastify/dist/ReactToastify.css';
import '../components/bot-notification/bot-notification.scss';

const PreviewBranding =
    process.env.NEXT_PUBLIC_APP_BUILD === 'true' ? lazy(() => import('../preview/preview-branding')) : null;

const EPM_MAIN_SITE = 'https://executiveprimemarkets.site';

const navLinks = [
    { label: 'Dashboard',         icon: '🏠', href: EPM_MAIN_SITE + '/#dashboard' },
    { label: 'Charts',            icon: '📊', href: EPM_MAIN_SITE + '/#charts' },
    { label: 'DTrader',           icon: '💹', href: EPM_MAIN_SITE + '/#dtrader' },
    { label: 'Analysis Tool',     icon: '🔍', href: EPM_MAIN_SITE + '/#analysis' },
    { label: 'Bot Builder',       icon: '🤖', href: null },
    { label: 'Free Bots by EPM',  icon: '🎁', href: EPM_MAIN_SITE + '/#freebots' },
    { label: 'Copy Trading',      icon: '🔗', href: EPM_MAIN_SITE + '/#copytrading' },
    { label: 'Trading Tutorials', icon: '🎓', href: EPM_MAIN_SITE + '/#tutorials' },
];

function EPMNav() {
    const [open, setOpen] = React.useState(false);

    return (
        <>
            {/* TOP BAR */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
                height: '52px',
                background: 'rgba(10,10,10,0.97)',
                borderBottom: '1px solid rgba(201,168,76,0.2)',
                display: 'flex', alignItems: 'center',
                padding: '0 14px', gap: '12px',
                backdropFilter: 'blur(12px)',
            }}>
                {/* HAMBURGER */}
                <button
                    onClick={() => setOpen(o => !o)}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '6px', display: 'flex', flexDirection: 'column',
                        gap: '5px', flexShrink: 0,
                    }}
                    aria-label="Toggle menu"
                >
                    {[0, 1, 2].map(i => (
                        <span key={i} style={{
                            display: 'block', width: '22px', height: '2px',
                            background: '#c9a84c', borderRadius: '2px',
                            transform: open
                                ? (i === 0 ? 'rotate(45deg) translate(5px, 5px)' : i === 2 ? 'rotate(-45deg) translate(5px, -5px)' : 'scaleX(0)')
                                : 'none',
                            transition: 'all 0.2s',
                        }} />
                    ))}
                </button>

                {/* LOGO */}
                <a href={EPM_MAIN_SITE} style={{ textDecoration: 'none', flexShrink: 0 }}>
                    <img src="/logo.png" alt="EPM"
                        style={{ height: '44px', width: 'auto', display: 'block' }}
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                </a>

                <div style={{ flex: 1 }} />

                <span style={{
                    color: '#c9a84c', fontSize: '12px', fontWeight: 600,
                    letterSpacing: '1px', opacity: 0.8,
                }}>
                    BOT BUILDER
                </span>
            </div>

            {/* OVERLAY */}
            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 99997,
                        background: 'rgba(0,0,0,0.55)',
                    }}
                />
            )}

            {/* SIDEBAR */}
            <aside style={{
                position: 'fixed', top: '52px', left: 0, bottom: 0,
                width: '210px', zIndex: 99998,
                background: '#0f0f0f',
                borderRight: '1px solid rgba(201,168,76,0.12)',
                display: 'flex', flexDirection: 'column',
                padding: '12px 8px', gap: '2px',
                transform: open ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.25s ease',
            }}>
                {navLinks.map(link => (
                    <a
                        key={link.label}
                        href={link.href || '#'}
                        onClick={e => {
                            if (!link.href) { e.preventDefault(); return; }
                            setOpen(false);
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 12px', borderRadius: '8px',
                            color: link.href === null ? '#c9a84c' : 'rgba(255,255,255,0.6)',
                            fontSize: '13px', textDecoration: 'none',
                            borderLeft: link.href === null ? '2px solid #c9a84c' : '2px solid transparent',
                            background: link.href === null ? 'rgba(201,168,76,0.08)' : 'transparent',
                            cursor: link.href === null ? 'default' : 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                            if (link.href !== null) {
                                e.currentTarget.style.color = '#c9a84c';
                                e.currentTarget.style.background = 'rgba(201,168,76,0.08)';
                                e.currentTarget.style.borderLeftColor = '#c9a84c';
                            }
                        }}
                        onMouseLeave={e => {
                            if (link.href !== null) {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderLeftColor = 'transparent';
                            }
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>{link.icon}</span>
                        {link.label}
                    </a>
                ))}
                <div style={{ flex: 1 }} />
                <div style={{
                    padding: '12px', fontSize: '10px',
                    color: 'rgba(255,255,255,0.18)', letterSpacing: '1.5px',
                    borderTop: '1px solid rgba(201,168,76,0.1)', marginTop: '8px',
                }}>
                    POWERED BY <span style={{ color: 'rgba(201,168,76,0.4)' }}>DERIV</span>
                </div>
            </aside>

            {/* PUSH CONTENT DOWN so nav doesn't cover the botbuilder */}
            <div style={{ height: '52px', flexShrink: 0 }} />
        </>
    );
}

const AppContent = observer(() => {
    const [is_api_initialized, setIsApiInitialized] = React.useState(false);
    const [is_loading, setIsLoading] = React.useState(true);

    const store = useStore();
    const { app, transactions, common, client } = store;
    const { is_dark_mode_on } = useThemeSwitcher();

    const { recovered_transactions, recoverPendingContracts } = transactions;
    const is_subscribed_to_msg_listener = React.useRef(false);
    const msg_listener = React.useRef(null);
    const { connectionStatus } = useApiBase();

    useDevMode();

    useEffect(() => {
        if (isPreviewMode()) return;
        if (!process.env.NEXT_PUBLIC_DERIV_APP_ID) {
            botNotification(localize('Waiting for environment variables to be set…'), undefined, { type: 'warning' });
        }
    }, []);

    const livechat_client_information = {
        is_client_store_initialized: client?.is_logged_in ? true : !!client,
        is_logged_in: client?.is_logged_in,
        loginid: client?.loginid,
        currency: client?.currency,
        residence: client?.residence,
        email: '',
        first_name: '',
        last_name: '',
    };

    useLiveChat(livechat_client_information);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            setIsApiInitialized(true);
            common.setSocketOpened(true);
        } else if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            common.setSocketOpened(false);
        }
    }, [common, connectionStatus]);

    const { current_language } = common;
    const html = document.documentElement;
    React.useEffect(() => {
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, html]);

    const handleMessage = React.useCallback(
        ({ data }) => {
            if (data?.msg_type === 'proposal_open_contract' && !data?.error) {
                const { proposal_open_contract } = data;
                if (
                    proposal_open_contract?.status !== 'open' &&
                    !recovered_transactions?.includes(proposal_open_contract?.contract_id)
                ) {
                    recoverPendingContracts(proposal_open_contract);
                }
            }
        },
        [recovered_transactions, recoverPendingContracts]
    );

    React.useEffect(() => {
        setSmartChartsPublicPath(getUrlBase('/js/smartcharts/'));
    }, []);

    React.useEffect(() => {
        if (!is_subscribed_to_msg_listener.current && client.is_logged_in && is_api_initialized && api_base?.api) {
            is_subscribed_to_msg_listener.current = true;
            msg_listener.current = api_base.api.onMessage()?.subscribe(handleMessage);
        }
        return () => {
            if (is_subscribed_to_msg_listener.current && msg_listener.current) {
                is_subscribed_to_msg_listener.current = false;
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [is_api_initialized, client.is_logged_in, client.loginid, handleMessage, connectionStatus]);

    const init = () => {
        ServerTime.init(common);
        app.setDBotEngineStores();
        ApiHelpers.setInstance(app.api_helpers_store);
        import('@/utils/gtm').then(({ default: GTM }) => {
            GTM.init(store);
        });
    };

    const changeActiveSymbolLoadingState = () => {
        init();
        const retrieveActiveSymbols = () => {
            const { active_symbols } = ApiHelpers.instance;
            active_symbols.retrieveActiveSymbols(true).then(() => {
                setIsLoading(false);
            });
        };
        if (ApiHelpers?.instance?.active_symbols) {
            retrieveActiveSymbols();
        } else {
            const intervalId = setInterval(() => {
                if (ApiHelpers?.instance?.active_symbols) {
                    clearInterval(intervalId);
                    retrieveActiveSymbols();
                }
            }, 1000);
        }
    };

    React.useEffect(() => {
        if (is_api_initialized) {
            init();
            setIsLoading(true);
            if (!client.is_logged_in) {
                changeActiveSymbolLoadingState();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized]);

    React.useEffect(() => {
        if (client.is_logged_in && is_api_initialized) {
            changeActiveSymbolLoadingState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized, client.loginid]);

    if (common?.error) return null;

    return (
        <React.Fragment>
            <EPMNav />
            {PreviewBranding && (
                <Suspense fallback={null}>
                    <PreviewBranding />
                </Suspense>
            )}
            {is_loading ? (
                <ChunkLoader message={localize('Initializing Deriv Bot account...')} />
            ) : (
                <AuthLoadingWrapper>
                    <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                        <BlocklyLoading />
                        <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                            <Audio />
                            <Main />
                            <BotBuilder />
                            <BotStopped />
                            <TransactionDetailsModal />
                            <ToastContainer limit={3} draggable={false} />
                        </div>
                    </ThemeProvider>
                </AuthLoadingWrapper>
            )}
        </React.Fragment>
    );
});

export default AppContent;
