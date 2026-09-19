import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { toast } from 'react-toastify';
import { load, save_types } from '@/external/bot-skeleton';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import './freebots.scss';

type TBotSummary = {
    id: number;
    name: string;
    description: string;
    market: string;
    risk_level: string;
    contract_type: string;
    created_at: string;
};

const DESCRIPTION_PREVIEW_LENGTH = 160;

// Module-level (not component state) so it survives this component being
// unmounted and remounted every time someone leaves and returns to this
// tab -- Tabs unmounts inactive tabs entirely. Stale-while-revalidate:
// show whatever's cached instantly, then always fetch fresh data in the
// background and update when it arrives, so this feels instant on repeat
// visits while still staying current.
//
// Also mirrored into sessionStorage: an in-memory cache alone only helps
// switching tabs within the same page load -- a full refresh clears it,
// since that's a fresh JS execution. Reading sessionStorage here, at
// module-evaluation time (before the component even renders), means a
// refresh can still show the last known list instantly instead of a bare
// loading state, while a background fetch keeps it current.
const SESSION_STORAGE_KEY = 'epm_freebots_cache_v1';

let bots_cache: TBotSummary[] | null = (() => {
    try {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as TBotSummary[]) : null;
    } catch {
        // Storage unavailable (privacy mode, quota, etc.) or corrupted --
        // fall back to no cache, same as before this existed.
        return null;
    }
})();

const persistBotsCache = (bots_list: TBotSummary[]) => {
    bots_cache = bots_list;
    try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(bots_list));
    } catch {
        // Ignore -- the in-memory cache above still works for this page load.
    }
};

// Fixed display order for contract-type sections. Anything that doesn't
// match one of these (including bots added before this field existed,
// which default to 'Other' server-side) falls into 'Other' at the end.
const CONTRACT_TYPE_ORDER = [
    'Accumulators',
    'Rise/Fall',
    'Matches/Differs',
    'Over/Under',
    'Even/Odd',
    'Multiplier',
    'Other',
];

const Freebots = observer(() => {
    const { dashboard } = useStore();
    const { setActiveTab } = dashboard;

    const [bots, setBots] = useState<TBotSummary[]>(bots_cache ?? []);
    const [isLoading, setIsLoading] = useState(!bots_cache);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadingBotId, setLoadingBotId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchBots = async () => {
            if (!bots_cache) setIsLoading(true);
            setLoadError(null);
            try {
                const res = await fetch(`/api/bots?t=${Date.now()}`, { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || localize('Failed to load bots'));
                const bots_list = data.bots || [];
                persistBotsCache(bots_list);
                if (!cancelled) setBots(bots_list);
            } catch (err: any) {
                // Only surface the error if we have nothing cached to show --
                // if a background refresh fails, silently keep showing the
                // last known-good list rather than replacing it with an error.
                if (!cancelled && !bots_cache) setLoadError(err?.message || localize('Failed to load bots'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        fetchBots();
        return () => {
            cancelled = true;
        };
    }, []);

    const sections = useMemo(() => {
        const groups: Record<string, TBotSummary[]> = {};
        bots.forEach(bot => {
            const key = CONTRACT_TYPE_ORDER.includes(bot.contract_type) ? bot.contract_type : 'Other';
            if (!groups[key]) groups[key] = [];
            groups[key].push(bot);
        });
        return CONTRACT_TYPE_ORDER.map(type => ({ type, bots: groups[type] || [] })).filter(
            section => section.bots.length > 0
        );
    }, [bots]);

    const handleLoadBot = async (bot: TBotSummary) => {
        setLoadingBotId(bot.id);
        try {
            const res = await fetch(`/api/bots?id=${bot.id}&t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || localize('Failed to load bot'));

            await load({
                block_string: data.bot.xml_content,
                file_name: data.bot.name,
                workspace: window.Blockly?.derivWorkspace,
                from: save_types.LOCAL,
                drop_event: {},
                strategy_id: null,
                showIncompatibleStrategyDialog: false,
            });

            setActiveTab(DBOT_TABS.BOT_BUILDER);
            toast.success(localize('Bot loaded into Bot Builder'));
        } catch (err: any) {
            toast.error(err?.message || localize('Failed to load bot'));
        } finally {
            setLoadingBotId(null);
        }
    };

    const renderCard = (bot: TBotSummary) => {
        const isExpanded = expandedId === bot.id;
        const isLong = bot.description.length > DESCRIPTION_PREVIEW_LENGTH;
        return (
            <div key={bot.id} className='freebots__card'>
                <h2 className='freebots__card-title'>{bot.name}</h2>
                <div className='freebots__card-tags'>
                    <span className='freebots__tag'>{bot.market}</span>
                    <span className='freebots__tag'>{bot.risk_level}</span>
                </div>
                <p
                    className={
                        isExpanded
                            ? 'freebots__card-description freebots__card-description--expanded'
                            : 'freebots__card-description'
                    }
                >
                    {bot.description}
                </p>
                {isLong && (
                    <button
                        type='button'
                        className='freebots__learn-more'
                        onClick={() => setExpandedId(isExpanded ? null : bot.id)}
                    >
                        {isExpanded ? localize('Show less') : localize('Learn more')}
                    </button>
                )}
                <button
                    type='button'
                    className='freebots__load-btn'
                    disabled={loadingBotId === bot.id}
                    onClick={() => handleLoadBot(bot)}
                >
                    {loadingBotId === bot.id ? (
                        <Localize i18n_default_text='Loading...' />
                    ) : (
                        <Localize i18n_default_text='Load Bot' />
                    )}
                </button>
            </div>
        );
    };

    return (
        <div className='freebots'>
            <div className='freebots__header'>
                <h1 className='freebots__title'>
                    <Localize i18n_default_text='Free Bots' />
                </h1>
                <p className='freebots__subtitle'>
                    <Localize i18n_default_text='Browse and load pre-built trading bots to get started quickly.' />
                </p>
            </div>

            {isLoading && (
                <div className='freebots__status'>
                    <Localize i18n_default_text='Loading bots...' />
                </div>
            )}

            {!isLoading && loadError && <div className='freebots__status freebots__status--error'>{loadError}</div>}

            {!isLoading && !loadError && bots.length === 0 && (
                <div className='freebots__status'>
                    <Localize i18n_default_text='No bots have been added yet. Check back soon.' />
                </div>
            )}

            {!isLoading &&
                !loadError &&
                sections.map(section => (
                    <div key={section.type} className='freebots__section'>
                        <h2 className='freebots__section-title'>{section.type}</h2>
                        <div className='freebots__grid'>{section.bots.map(renderCard)}</div>
                    </div>
                ))}
        </div>
    );
});

export default Freebots;
