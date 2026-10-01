import type { ContractType } from './contract-analysis';
import type { TBotSummary } from '@/utils/freebots-cache';

// Category names as the EPM Bots page groups them.
export const BOT_CATEGORY: Record<ContractType, string> = {
    over_under: 'Over/Under',
    odd_even: 'Even/Odd',
    rise_fall: 'Rise/Fall',
    match_differ: 'Matches/Differs',
    accumulator: 'Accumulators',
    multiplier: 'Multiplier',
};

// Bot names given for specific sides. Matched by exact name (ignoring case
// and punctuation) against the bots listed on the EPM Bots page.
export const DEFAULT_BOT_NAMES: Record<string, string> = {
    'over_under:Under 2': 'Apex Under 2 Sniper',
    'over_under:Over 7': 'Apex Over 7 Striker',
};

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const CHOICES_STORAGE_KEY = 'epm_analysis_bot_choices_v1';

export const keyFor = (contractType: ContractType, side: string) => `${contractType}:${side}`;

export const readChoices = (): Record<string, number> => {
    try {
        return JSON.parse(window.localStorage.getItem(CHOICES_STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
};

export const writeChoices = (choices: Record<string, number>) => {
    try {
        window.localStorage.setItem(CHOICES_STORAGE_KEY, JSON.stringify(choices));
    } catch {
        // Storage unavailable -- the choice still works for this visit.
    }
};

/** The bot for a given side: the user's own saved pick if they made one,
 *  otherwise a name given for that exact side (currently just Under 2 and
 *  Over 7), otherwise none -- never guesses. */
export function resolveBot(
    bots: TBotSummary[],
    contractType: ContractType,
    side: string,
    choices: Record<string, number> = readChoices()
): TBotSummary | undefined {
    const savedId = choices[keyFor(contractType, side)];
    if (savedId) {
        const saved = bots.find(b => b.id === savedId);
        if (saved) return saved;
    }
    const name = DEFAULT_BOT_NAMES[keyFor(contractType, side)];
    if (!name) return undefined;
    return bots.find(b => normalize(b.name) === normalize(name));
}
