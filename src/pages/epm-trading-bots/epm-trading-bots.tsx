import React, { lazy, Suspense, useState } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';
import Tabs from '@/components/shared_ui/tabs/tabs';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import Freebots from './freebots';
import './epm-trading-bots.scss';

const AdminBots = lazy(() => import('./admin'));
const AiBotBuilder = lazy(() => import('../ai-bot-builder'));

// Only these accounts (owner's demo + real) can see the Admin tab. This only
// hides the tab in the UI — actual add/delete calls are still checked
// server-side against the admin password (see admin.tsx), which is unchanged.
const ADMIN_LOGINIDS = ['DOT93462536', 'RTO92086906'];

const EpmTradingBots = () => {
    const [active_sub_tab, setActiveSubTab] = useState(0);
    const { client } = useStore() ?? {};
    const is_admin = !!client?.loginid && ADMIN_LOGINIDS.includes(client.loginid);

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
};

export default EpmTradingBots;
