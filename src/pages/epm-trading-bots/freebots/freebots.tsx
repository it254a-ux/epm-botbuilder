import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { toast } from 'react-toastify';
import { load, save_types } from '@/external/bot-skeleton';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import Modal from '@/components/shared_ui/modal';
import { bots_cache, fetchAndCacheBots, TBotSummary } from '@/utils/freebots-cache';
import { Localize, localize } from '@deriv-com/translations';
import './freebots.scss';

const DESCRIPTION_PREVIEW_LENGTH = 160;

// Maps a risk_level string (free text, admin-entered) to a CSS modifier
// suffix for color-coding the badge in the details modal -- low/medium/high
// get their own distinct color instead of every tag looking identical, and
// anything that doesn't match one of the three known levels degrades
// gracefully to the plain/neutral tag style rather than guessing.
const riskLevelSlug = (riskLevel: string): 'low' | 'medium' | 'high' | 'neutral' => {
    const normalized = riskLevel.trim().toLowerCase();
    if (normalized.includes('low')) return 'low';
    if (normalized.includes('medium')) return 'medium';
    if (normalized.includes('high')) return 'high';
    return 'neutral';
};

type TDescriptionBlock = { heading: string | null; text: string };

// Bot descriptions are free-form text an admin typed into a <textarea> --
// there's no structured "summary" vs "details" field, just one blob. Admins
// have been naturally writing things like a short overview, then a blank
// line, then "Description (longer):" followed by more detail (see the
// TrendBreaker Extended Edition bot). Rendered as one plain paragraph with
// whitespace: pre-wrap, that reads as an undifferentiated wall of text.
// This turns each blank-line-separated chunk into its own paragraph, and
// treats a short first line ending in ':' as a sub-heading for that
// paragraph specifically -- without needing a real "heading" field in the
// database or assuming every bot's description follows that exact pattern.
const parseDescription = (description: string): TDescriptionBlock[] => {
    return description
        .split(/\n\s*\n/)
        .map(chunk => chunk.trim())
        .filter(Boolean)
        .map(chunk => {
            const firstLineBreak = chunk.indexOf('\n');
            const firstLine = firstLineBreak === -1 ? chunk : chunk.slice(0, firstLineBreak);
            const looksLikeHeading = firstLine.length <= 40 && firstLine.trim().endsWith(':');
            if (looksLikeHeading && firstLineBreak !== -1) {
                return {
                    heading: firstLine.trim().replace(/:$/, ''),
                    text: chunk.slice(firstLineBreak + 1).trim(),
                };
            }
            return { heading: null, text: chunk };
        });
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
    // The bot whose full details are showing in the pop-out modal, or null
    // when it's closed. Replaced the old expandedId (which expanded the
    // description in place, pushing the whole card and everything below it
    // taller) with this instead -- the card itself never changes size now.
    const [detailsBot, setDetailsBot] = useState<TBotSummary | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadBots = async () => {
            if (!bots_cache) setIsLoading(true);
            setLoadError(null);
            try {
                const bots_list = await fetchAndCacheBots();
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

        loadBots();
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
        setDetailsBot(null);
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
        const isLong = bot.description.length > DESCRIPTION_PREVIEW_LENGTH;
        return (
            <div key={bot.id} className='freebots__card'>
                <h2 className='freebots__card-title'>{bot.name}</h2>
                <div className='freebots__card-tags'>
                    <span className='freebots__tag'>{bot.market}</span>
                    <span className='freebots__tag'>{bot.risk_level}</span>
                </div>
                <p className='freebots__card-description'>{bot.description}</p>
                {isLong && (
                    <button type='button' className='freebots__learn-more' onClick={() => setDetailsBot(bot)}>
                        <Localize i18n_default_text='Learn more' />
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

            <Modal
                is_open={!!detailsBot}
                toggleModal={() => setDetailsBot(null)}
                title={detailsBot?.name}
                width='560px'
                className='freebots-details-modal'
                should_header_stick_body={false}
            >
                {detailsBot && (
                    <>
                        <Modal.Body className='freebots-details-modal__body'>
                            <div className='freebots-details-modal__tags'>
                                <span className='freebots__tag'>{detailsBot.market}</span>
                                <span
                                    className={`freebots__tag freebots__tag--risk-${riskLevelSlug(detailsBot.risk_level)}`}
                                >
                                    {detailsBot.risk_level}
                                </span>
                                {detailsBot.contract_type && (
                                    <span className='freebots__tag'>{detailsBot.contract_type}</span>
                                )}
                            </div>
                            <div className='freebots-details-modal__description'>
                                {parseDescription(detailsBot.description).map((block, index) =>
                                    block.heading ? (
                                        <div key={index} className='freebots-details-modal__block'>
                                            <h4 className='freebots-details-modal__block-heading'>
                                                {block.heading}
                                            </h4>
                                            <p>{block.text}</p>
                                        </div>
                                    ) : (
                                        <p key={index} className='freebots-details-modal__paragraph'>
                                            {block.text}
                                        </p>
                                    )
                                )}
                            </div>
                        </Modal.Body>
                        {/* Kept out of the scrollable body on purpose -- Modal.Footer
                            (dc-modal-footer) sits outside dc-modal-body's own scroll
                            region, so Load Bot stays visible and reachable even when
                            the description is long enough to need scrolling. */}
                        <Modal.Footer className='freebots-details-modal__footer'>
                            <button
                                type='button'
                                className='freebots__load-btn'
                                disabled={loadingBotId === detailsBot.id}
                                onClick={() => handleLoadBot(detailsBot)}
                            >
                                {loadingBotId === detailsBot.id ? (
                                    <Localize i18n_default_text='Loading...' />
                                ) : (
                                    <Localize i18n_default_text='Load Bot' />
                                )}
                            </button>
                        </Modal.Footer>
                    </>
                )}
            </Modal>
        </div>
    );
});

export default Freebots;
