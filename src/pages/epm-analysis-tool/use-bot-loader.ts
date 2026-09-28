import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { bots_cache, fetchAndCacheBots, type TBotSummary } from '@/utils/freebots-cache';
import { localize } from '@deriv-com/translations';

/** Lists the bots from the EPM Bots page and loads one into Bot Builder --
 *  the same request + Blockly load the Freebots page's own "Load" button
 *  uses. Loading only puts the bot in the workspace; it never runs it. */
export function useBotLoader() {
    const { dashboard } = useStore();
    const [bots, setBots] = useState<TBotSummary[]>(bots_cache ?? []);
    const [loadingBotId, setLoadingBotId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchAndCacheBots()
            .then(list => {
                if (!cancelled) setBots(list);
            })
            .catch(() => {
                // Keep whatever cached list we already have.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const loadBot = async (bot: TBotSummary) => {
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
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            toast.success(localize('Bot loaded into Bot Builder'));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : localize('Failed to load bot'));
        } finally {
            setLoadingBotId(null);
        }
    };

    return { bots, loadingBotId, loadBot };
}
