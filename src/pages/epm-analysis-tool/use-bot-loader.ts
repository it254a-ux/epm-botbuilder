import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { showBotLoadedNotice } from '@/components/run-panel/bot-loaded-notice-store';
import { load, save_types } from '@/external/bot-skeleton';
import { bots_cache, fetchAndCacheBots, type TBotSummary } from '@/utils/freebots-cache';
import { localize } from '@deriv-com/translations';

/** Lists the bots from the EPM Bots page and loads one into the workspace --
 *  the same request + Blockly load the Freebots page's own "Load" button
 *  uses -- but stays on this page so the Run panel here can run it.
 *  Loading never runs the bot. */
export function useBotLoader() {
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
                // load() shows its own "You've successfully imported a bot."
                // toast by default, stacking with the one below -- one toast
                // is enough, and this one's wording is more useful here.
                show_snackbar: false,
            });
            showBotLoadedNotice(localize('{{name}} — press Run in the panel', { name: bot.name }));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : localize('Failed to load bot'));
        } finally {
            setLoadingBotId(null);
        }
    };

    return { bots, loadingBotId, loadBot };
}
