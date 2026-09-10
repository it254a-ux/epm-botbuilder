import React, { lazy, Suspense, useState } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';
import Tabs from '@/components/shared_ui/tabs/tabs';
import { Localize, localize } from '@deriv-com/translations';
import Freebots from './freebots';
import './epm-trading-bots.scss';

const AdminBots = lazy(() => import('./admin'));
const AiBotBuilder = lazy(() => import('../ai-bot-builder'));

const EpmTradingBots = () => {
    const [active_sub_tab, setActiveSubTab] = useState(0);

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
                <div label={<Localize i18n_default_text='Admin' />} id='id-epm-admin'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading admin panel...')} />}>
                        <AdminBots />
                    </Suspense>
                </div>
            </Tabs>
        </div>
    );
};

export default EpmTradingBots;
