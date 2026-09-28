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

const STORAGE_KEY = 'epm_analysis_bot_choices_v1';

const readChoices = (): Record<string, number> => {
    try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface Props {
    contractType: ContractType;
    /** One entry per side shown in the result (or a single entry for types with no split). */
    sides: string[];
}

/**
 * Manual shortcuts: you choose which of your bots goes with each side, then
 * press "Load bot". Nothing here reads streaks or observed percentages --
 * it never suggests, highlights or auto-loads a bot based on the numbers,
 * and it only loads (never runs) the bot.
 */
function BotShortcuts({ contractType, sides }: Props) {
    const { bots, loadingBotId, loadBot } = useBotLoader();
    const [choices, setChoices] = useState<Record<string, number>>(readChoices);

    const category = BOT_CATEGORY[contractType];
    const inCategory = bots.filter(b => b.contract_type === category);
    const others = bots.filter(b => b.contract_type !== category);

    const keyFor = (side: string) => `${contractType}:${side}`;

    // With no saved choice, pre-select a bot only for Over/Under, and only
    // when exactly one bot in that category has the side's name in its own
    // name (e.g. "Under 2" -> "Under 2 Sniper"). Anything else stays empty.
    const defaultFor = (side: string): number | undefined => {
        if (contractType !== 'over_under') return undefined;
        const matches = inCategory.filter(b => normalize(b.name).includes(normalize(side)));
        return matches.length === 1 ? matches[0].id : undefined;
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
                            <span className='epm-analysis-tool__bot-side'>{side}</span>
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
                        </div>
                    );
                })}
            </div>
            <div className='epm-analysis-tool__note'>
                <Localize i18n_default_text='Loads the bot into Bot Builder — you still review and press Run yourself. This is a shortcut, not a signal: it never picks or loads a bot based on the numbers above.' />
            </div>
        </div>
    );
}

export default BotShortcuts;
