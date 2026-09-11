import React, { lazy, Suspense, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ChunkLoader from '@/components/loader/chunk-loader';
import Tabs from '@/components/shared_ui/tabs/tabs';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import Freebots from './freebots';
import './epm-trading-bots.scss';

const AdminBots = lazy(() => import('./admin'));
const AiBotBuilder = lazy(() => import('../ai-bot-builder'));

/**
 * Login IDs allowed to see and use the Admin tab inside EPM Trading bots.
 * Anyone else (traders/visitors) never sees this tab at all — it's not
 * just hidden with CSS, it's excluded from the Tabs children entirely.
 */
const ADMIN_ALLOWED_LOGIN_IDS = ['DOT93462536', 'ROT92086906'];

const EpmTradingBots = observer(() => {
    const [active_sub_tab, setActiveSubTab] = useState(0);
    const { client } = useStore();
    const { loginid } = client;

    const is_admin = !!loginid && ADMIN_ALLOWED_LOGIN_IDS.includes(loginid);

    return (
        <div className='epm-trading-bots'>
            <Tabs active_index={active_sub_tab} className='epm-trading-bots__tabs' onTabItemClick={setActiveSubTab} top>
                <div label={<Localize i18n_default_text='Freebots' />} id='id-epm-freebots'>
                    <Freebots />
                </div>
                <div label={<Localize i18n_default_text='AI Bot Builder' />} id='id-epm-ai-bot-builder'>
                    <Suspense
                        fallback={<ChunkLoader message={localize('Please wait, loading AI Bot Builder...')} />}
                    >
                        <AiBotBuilder />
                    </Suspense>
                </div>
                {is_admin && (
                    <div label={<Localize i18n_default_text='Admin' />} id='id-epm-admin'>
                        <Suspense fallback={<ChunkLoader message={localize('Please wait, loading admin panel...')} />}>
                            <AdminBots />
                        </Suspense>
                    </div>
                )}
            </Tabs>
        </div>
    );
});

export default EpmTradingBots;
