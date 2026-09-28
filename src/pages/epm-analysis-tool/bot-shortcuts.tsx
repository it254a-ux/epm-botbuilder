import { useState } from 'react';
import { Localize, localize } from '@deriv-com/translations';
import type { ContractType } from './contract-analysis';
import { useBotLoader } from './use-bot-loader';

// Category names as the EPM Bots page groups them (CONTRACT_TYPE_ORDER).
const BOT_CATEGORY: Record<ContractType, string> = {
    over_under: 'Over/Under',
    odd_even: 'Even/Odd',
    rise_fall: 'Rise/Fall',
    accumulator: 'Accumulators',
    multiplier: 'Multiplier',
};

// Bots the user named for each side. Matched by exact name (ignoring case and
// punctuation) against the bots on the EPM Bots page.
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
    /** One entry per side shown in the result (or a single entry for types with no split). */
    sides: string[];
    /** Sides where the user's own rule is currently met -- shown as a badge only. */
    flaggedSides?: string[];
    /** When true, the Load bot button only appears for sides where the rule is met. */
    requireFlag?: boolean;
}

/**
 * Shortcuts: you choose which of your bots goes with each side, then press
 * "Load bot". It loads the bot into Bot Builder and never runs it. A "Rule
 * met" badge just repeats the user's own rule from the result table.
 */
function BotShortcuts({ contractType, sides, flaggedSides = [], requireFlag = false }: Props) {
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

    return (
        <div className='epm-analysis-tool__panel'>
            <h2 className='epm-analysis-tool__panel-title'>
                <Localize i18n_default_text='Your bots' />
            </h2>
            <div className='epm-analysis-tool__bot-list'>
                {sides.map(side => {
                    const selectedId = selectedFor(side);
                    const selectedBot = bots.find(b => b.id === selectedId);
                    return (
                        <div className='epm-analysis-tool__bot-row' key={side}>
                            <span className='epm-analysis-tool__bot-side'>
                                {side}
                                {flaggedSides.includes(side) && (
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
                            {(!requireFlag || flaggedSides.includes(side)) && (
                                <button
                                    type='button'
                                    className='epm-analysis-tool__btn-primary epm-analysis-tool__btn-inline'
                                    disabled={!selectedBot || loadingBotId !== null}
                                    onClick={() => selectedBot && loadBot(selectedBot)}
                                >
                                    {loadingBotId === selectedId && selectedId !== undefined
                                        ? localize('Loading…')
                                        : localize('Load bot')}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className='epm-analysis-tool__note'>
                <Localize i18n_default_text='Loads the bot here. You press Run in the panel yourself.' />
            </div>
        </div>
    );
}

export default BotShortcuts;
