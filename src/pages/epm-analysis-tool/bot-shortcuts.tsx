import { useState } from 'react';
import { Localize, localize } from '@deriv-com/translations';
import type { ContractType } from './contract-analysis';
import { useBotLoader } from './use-bot-loader';

// Category names as the EPM Bots page groups them.
const BOT_CATEGORY: Record<ContractType, string> = {
    over_under: 'Over/Under',
    odd_even: 'Even/Odd',
    rise_fall: 'Rise/Fall',
    match_differ: 'Matches/Differs',
    accumulator: 'Accumulators',
    multiplier: 'Multiplier',
};

// Bot names given for specific sides. Matched by exact name (ignoring case
// and punctuation) against the bots listed on the EPM Bots page.
const DEFAULT_BOT_NAMES: Record<string, string> = {
    'over_under:Under 2': 'Apex Under 2 Sniper',
    'over_under:Over 7': 'Apex Over 7 Striker',
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STORAGE_KEY = 'epm_analysis_bot_choices_v1';

const readChoices = (): Record<string, number> => {
    try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
};

interface Props {
    contractType: ContractType;
    /** One entry per side, e.g. ["Under 2", "Over 7"]. */
    sides: string[];
    /** Sides currently flagged -- Load bot only shows for these. */
    flaggedSides: string[];
}

function BotShortcuts({ contractType, sides, flaggedSides }: Props) {
    const { bots, loadingBotId, loadBot } = useBotLoader();
    const [choices, setChoices] = useState<Record<string, number>>(readChoices);

    const category = BOT_CATEGORY[contractType];
    const inCategory = bots.filter(b => b.contract_type === category);
    const others = bots.filter(b => b.contract_type !== category);
    const keyFor = (side: string) => `${contractType}:${side}`;

    const defaultFor = (side: string): number | undefined => {
        const name = DEFAULT_BOT_NAMES[keyFor(side)];
        return name ? bots.find(b => normalize(b.name) === normalize(name))?.id : undefined;
    };

    const selectedFor = (side: string) => choices[keyFor(side)] ?? defaultFor(side);

    const onChoose = (side: string, botId: number | undefined) => {
        const next = { ...choices };
        if (botId === undefined) delete next[keyFor(side)];
        else next[keyFor(side)] = botId;
        setChoices(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // Storage unavailable -- the choice still works for this visit.
        }
    };

    if (!sides.length) return null;

    return (
        <div className='epm-analysis-tool__panel'>
            <h2 className='epm-analysis-tool__panel-title'>
                <Localize i18n_default_text='Your bots' />
            </h2>
            <div className='epm-analysis-tool__bot-list'>
                {sides.map(side => {
                    const selectedId = selectedFor(side);
                    const selectedBot = bots.find(b => b.id === selectedId);
                    const isFlagged = flaggedSides.includes(side);
                    return (
                        <div className='epm-analysis-tool__bot-row' key={side}>
                            <span className='epm-analysis-tool__bot-side'>
                                {side}
                                {isFlagged && (
                                    <span className='epm-analysis-tool__badge'>
                                        <Localize i18n_default_text='Rule met' />
                                    </span>
                                )}
                            </span>
                            <select
                                className='epm-analysis-tool__select'
                                value={selectedId ?? ''}
                                onChange={e => onChoose(side, e.target.value ? Number(e.target.value) : undefined)}
                            >
                                <option value=''>{localize('— choose a bot —')}</option>
                                {inCategory.length > 0 && (
                                    <optgroup label={`${category} bots`}>
                                        {inCategory.map(b => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {others.length > 0 && (
                                    <optgroup label={localize('Other bots')}>
                                        {others.map(b => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            {isFlagged && (
                                <button
                                    type='button'
                                    className='epm-analysis-tool__btn-primary epm-analysis-tool__btn-inline'
                                    disabled={!selectedBot || loadingBotId !== null}
                                    onClick={() => selectedBot && loadBot(selectedBot)}
                                >
                                    {loadingBotId === selectedId ? localize('Loading…') : localize('Load bot')}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default BotShortcuts;
