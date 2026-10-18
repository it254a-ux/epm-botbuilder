/**
 * Pure logic for the Forex Live page: no React, no network.
 *
 * Forex Live trades Deriv "Multipliers" (MULTUP = BUY, MULTDOWN = SELL). A multiplier has NO fixed
 * duration: it stays open until you close it (or an optional stop loss / take profit is hit), so a trade
 * can be exited whenever you like. Many of them can be open at the same time.
 *
 * Everything that touches the exchange lives in use-forex-live.ts; this file only builds requests and
 * reads the answers, so it can be tested on its own.
 */

export type Side = 'BUY' | 'SELL';
export type MultiplierContract = 'MULTUP' | 'MULTDOWN';

export const CONTRACT_OF: Record<Side, MultiplierContract> = { BUY: 'MULTUP', SELL: 'MULTDOWN' };

/** Used when the multipliers allowed for a symbol cannot be loaded. */
export const FALLBACK_MULTIPLIERS = [30, 50, 100, 200, 300];

export const DEFAULT_SYMBOL = 'frxEURUSD';
/** 15 minutes, in seconds (SmartCharts granularity). */
export const DEFAULT_GRANULARITY = 900;

export interface TradeInput {
    side: Side;
    symbol: string;
    stake: number;
    multiplier: number;
    currency: string;
    /** Loss amount (in account currency) at which the trade closes itself. Empty = none. */
    stopLoss?: number | null;
    /** Profit amount (in account currency) at which the trade closes itself. Empty = none. */
    takeProfit?: number | null;
}

export interface BuyRequest {
    buy: '1';
    price: number;
    parameters: {
        contract_type: MultiplierContract;
        underlying_symbol: string;
        currency: string;
        /** Deriv needs to be told what the amount is: here, the stake. */
        basis: 'stake';
        amount: number;
        multiplier: number;
        limit_order?: { stop_loss?: number; take_profit?: number };
    };
}

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Returns a plain-words problem with the input, or null when it is fine to send. */
export function validateTrade(t: TradeInput): string | null {
    if (!t.symbol) return 'Pick a market first.';
    if (!t.currency) return 'Your account is still loading.';
    if (!positive(t.stake)) return 'Enter a stake above 0.';
    if (!positive(t.multiplier)) return 'Pick a multiplier.';
    if (t.stopLoss !== null && t.stopLoss !== undefined && !positive(t.stopLoss)) return 'Stop loss must be above 0, or empty.';
    if (t.takeProfit !== null && t.takeProfit !== undefined && !positive(t.takeProfit)) return 'Take profit must be above 0, or empty.';
    // A multiplier can never lose more than its stake, so a stop loss at or above the stake would never trigger.
    if (positive(t.stopLoss) && t.stopLoss >= t.stake) return 'Stop loss must be less than the stake.';
    return null;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** The exact message Deriv needs to open the trade immediately at the current price. */
export function buildBuyRequest(t: TradeInput): BuyRequest {
    const stake = money(t.stake);
    const limit: { stop_loss?: number; take_profit?: number } = {};
    if (positive(t.stopLoss)) limit.stop_loss = money(t.stopLoss);
    if (positive(t.takeProfit)) limit.take_profit = money(t.takeProfit);
    return {
        buy: '1', // written exactly like the bots' own buy request
        // For a multiplier the price is the stake: the most we agree to pay.
        price: stake,
        parameters: {
            contract_type: CONTRACT_OF[t.side],
            underlying_symbol: t.symbol,
            currency: t.currency,
            basis: 'stake',
            amount: stake,
            multiplier: t.multiplier,
            ...(Object.keys(limit).length ? { limit_order: limit } : {}),
        },
    };
}

/** The message that closes an open trade at the current market price. */
export function buildSellRequest(contractId: number): { sell: number; price: 0 } {
    return { sell: contractId, price: 0 };
}

export interface Position {
    id: number;
    symbol: string;
    side: Side;
    stake: number;
    multiplier: number | null;
    /** Current profit or loss. Null until the first live update arrives. */
    profit: number | null;
    entry: number | null;
    spot: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    openedAt: number | null;
    /** Price levels where the stop loss / take profit will trigger, when Deriv tells them. */
    stopLossAt?: number;
    takeProfitAt?: number;
    currency: string;
    /** True once the trade is closed (sold, stopped out or limit hit). */
    closed: boolean;
    /** Final result, when closed. */
    result: number | null;
    /** Deriv says the trade can be closed right now. */
    canClose: boolean;
    /** The close request is on its way (shown as "Closing…"). */
    closing?: boolean;
}

type Raw = Record<string, any>;

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const orderAmount = (o: unknown): number | null => {
    if (o && typeof o === 'object') return num((o as Raw).order_amount ?? (o as Raw).amount);
    return num(o);
};

/**
 * Reads one open-contract message (or one portfolio row) into a Position.
 * Returns null for anything that is not a multiplier, so bot trades never show up here.
 */
export function toPosition(raw: Raw | null | undefined): Position | null {
    if (!raw) return null;
    const type = String(raw.contract_type ?? '');
    if (type !== 'MULTUP' && type !== 'MULTDOWN') return null;
    const id = num(raw.contract_id);
    if (id === null) return null;

    const sold = raw.is_sold === 1 || raw.is_sold === true || (raw.status !== undefined && raw.status !== 'open');
    const profit = num(raw.profit);
    const limit = (raw.limit_order ?? {}) as Raw;
    return {
        id,
        symbol: String(raw.underlying_symbol ?? raw.underlying ?? raw.symbol ?? ''),
        side: type === 'MULTUP' ? 'BUY' : 'SELL',
        stake: num(raw.buy_price) ?? 0,
        multiplier: num(raw.multiplier),
        profit,
        entry: num(raw.entry_spot ?? raw.entry_tick),
        spot: num(raw.current_spot),
        stopLoss: orderAmount(limit.stop_loss),
        takeProfit: orderAmount(limit.take_profit),
        ...(num((limit.stop_loss as Raw | undefined)?.value) !== null ? { stopLossAt: num((limit.stop_loss as Raw).value) as number } : {}),
        ...(num((limit.take_profit as Raw | undefined)?.value) !== null ? { takeProfitAt: num((limit.take_profit as Raw).value) as number } : {}),
        openedAt: num(raw.purchase_time ?? raw.date_start),
        currency: String(raw.currency ?? ''),
        closed: sold,
        result: sold ? (profit ?? (num(raw.sell_price) !== null && num(raw.buy_price) !== null ? money(num(raw.sell_price)! - num(raw.buy_price)!) : null)) : null,
        // a closed trade can never be closed again; an open one can unless Deriv says it cannot right now
        canClose: !sold && (raw.is_valid_to_sell === undefined || raw.is_valid_to_sell === 1 || raw.is_valid_to_sell === true),
    };
}

/** A later message for the same trade replaces the earlier one, but never wipes out numbers it does not carry. */
export function mergePosition(prev: Position | undefined, next: Position): Position {
    if (!prev) return next;
    return {
        ...next,
        symbol: next.symbol || prev.symbol,
        stake: next.stake || prev.stake,
        multiplier: next.multiplier ?? prev.multiplier,
        profit: next.profit ?? prev.profit,
        entry: next.entry ?? prev.entry,
        spot: next.spot ?? prev.spot,
        stopLoss: next.stopLoss ?? prev.stopLoss,
        takeProfit: next.takeProfit ?? prev.takeProfit,
        openedAt: next.openedAt ?? prev.openedAt,
        ...(next.stopLossAt ?? prev.stopLossAt) !== undefined ? { stopLossAt: (next.stopLossAt ?? prev.stopLossAt) as number } : {},
        ...(next.takeProfitAt ?? prev.takeProfitAt) !== undefined ? { takeProfitAt: (next.takeProfitAt ?? prev.takeProfitAt) as number } : {},
        currency: next.currency || prev.currency,
    };
}

export interface Summary {
    open: number;
    buys: number;
    sells: number;
    stake: number;
    profit: number;
    winning: number;
    losing: number;
}

export function summarize(positions: Position[]): Summary {
    const s: Summary = { open: 0, buys: 0, sells: 0, stake: 0, profit: 0, winning: 0, losing: 0 };
    for (const p of positions) {
        if (p.closed) continue;
        s.open += 1;
        if (p.side === 'BUY') s.buys += 1;
        else s.sells += 1;
        s.stake += p.stake;
        const pl = p.profit ?? 0;
        s.profit += pl;
        if (pl > 0) s.winning += 1;
        else if (pl < 0) s.losing += 1;
    }
    s.stake = money(s.stake);
    s.profit = money(s.profit);
    return s;
}

export type CloseFilter = 'all' | 'buy' | 'sell' | 'winning' | 'losing';

/** Which open trades a "close ..." button applies to. `symbol` limits it to one market when given. */
export function pickToClose(positions: Position[], filter: CloseFilter, symbol?: string): Position[] {
    return positions.filter(p => {
        if (p.closed || !p.canClose) return false;
        if (symbol && p.symbol !== symbol) return false;
        switch (filter) {
            case 'buy':
                return p.side === 'BUY';
            case 'sell':
                return p.side === 'SELL';
            case 'winning':
                return (p.profit ?? 0) > 0;
            case 'losing':
                return (p.profit ?? 0) < 0;
            default:
                return true;
        }
    });
}

/** Multipliers Deriv allows for a symbol, read from a contracts_for answer. Falls back to a sensible list. */
export function readMultipliers(answer: Raw | null | undefined): number[] {
    const list: Raw[] = answer?.contracts_for?.available ?? answer?.contracts_for?.contracts ?? answer?.available ?? [];
    const found = new Set<number>();
    for (const c of Array.isArray(list) ? list : []) {
        const isMultiplier = c?.contract_category === 'multiplier' || c?.contract_type === 'MULTUP' || c?.contract_type === 'MULTDOWN';
        if (!isMultiplier) continue;
        const range = c.multiplier_range;
        if (Array.isArray(range)) range.forEach((m: unknown) => positive(Number(m)) && found.add(Number(m)));
    }
    const out = [...found].sort((a, b) => a - b);
    return out.length ? out : FALLBACK_MULTIPLIERS;
}

/** One plain sentence from whatever shape an error arrives in (Error, { error: { message } }, or a response). */
export function errorText(e: unknown): string {
    if (typeof e === 'string') return e;
    const any = e as Raw | null;
    const msg = any?.error?.message ?? any?.message ?? any?.error;
    return typeof msg === 'string' && msg ? msg : 'Something went wrong. Please try again.';
}

export interface PlanLevels {
    side: Side;
    entry: number;
    stopLoss: number;
    takeProfit: number;
}

/**
 * Turns the analysis plan (prices) into the money amounts a multiplier needs.
 * A multiplier moves by stake x multiplier x (price change / price), so a stop at distance d from the entry
 * loses stake x multiplier x d / entry. Returns null when the plan is for the other side or unusable.
 * The stop loss is kept just under the stake (a multiplier cannot lose more than its stake anyway).
 */
export function amountsFromPlan(
    plan: PlanLevels | null | undefined,
    side: Side,
    stake: number,
    multiplier: number
): { stopLoss: number; takeProfit: number } | null {
    if (!plan || plan.side !== side || !positive(plan.entry) || !positive(stake) || !positive(multiplier)) return null;
    const per = (level: number) => (stake * multiplier * Math.abs(level - plan.entry)) / plan.entry;
    // the stop must be on the losing side and the target on the winning side of the entry
    const slOk = side === 'BUY' ? plan.stopLoss < plan.entry : plan.stopLoss > plan.entry;
    const tpOk = side === 'BUY' ? plan.takeProfit > plan.entry : plan.takeProfit < plan.entry;
    const sl = slOk ? Math.min(money(per(plan.stopLoss)), money(stake - 0.01)) : 0;
    const tp = tpOk ? money(per(plan.takeProfit)) : 0;
    if (!(sl > 0) || !(tp > 0)) return null;
    return { stopLoss: sl, takeProfit: tp };
}

export interface PositionLine {
    key: string;
    title: string;
    price: number;
    color: string;
}

export const BUY_COLOR = '#06b6d4';
export const SELL_COLOR = '#f59e0b';

/** Chart lines for the open trades on one market: where each was entered (with its live profit) and its stop loss / take profit levels. */
export function positionLines(positions: Position[], symbol: string): PositionLine[] {
    const out: PositionLine[] = [];
    for (const p of positions) {
        if (p.closed || p.symbol !== symbol) continue;
        const color = p.side === 'BUY' ? BUY_COLOR : SELL_COLOR;
        if (p.entry !== null) {
            const pl = p.profit === null ? '' : ` ${formatMoney(p.profit)}`;
            out.push({ key: `pos-${p.id}`, title: `${p.side}${pl}`, price: p.entry, color });
        }
        if (p.stopLossAt !== undefined) out.push({ key: `pos-${p.id}-sl`, title: 'SL', price: p.stopLossAt, color: '#ef4444' });
        if (p.takeProfitAt !== undefined) out.push({ key: `pos-${p.id}-tp`, title: 'TP', price: p.takeProfitAt, color: '#10b981' });
    }
    return out;
}

/** Deriv refuses a stake that is too small and says the minimum in its message ("Enter an amount equal to or higher than 1.64."). */
export function parseMinStake(text: string): number | null {
    const m = /(?:equal to or higher than|equal to or greater than|at least|minimum(?: stake)?(?: is| of)?)\s*:?\s*(\d+(?:\.\d+)?)/i.exec(text || '');
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Turns Deriv's refusal into words that point at the right field. Deriv uses the same "equal to or higher
 * than N" wording for a too-small stake AND for a too-small stop loss / take profit, so the number alone
 * cannot say which: only a minimum ABOVE the stake can be about the stake. Anything else is shown as Deriv wrote it.
 */
export function explainRefusal(why: string, t: Pick<TradeInput, 'stake' | 'stopLoss' | 'takeProfit'>): { text: string; minStake: number | null } {
    const min = parseMinStake(why);
    if (min === null) return { text: why, minStake: null };
    if (min > t.stake) return { text: `the smallest stake on this market is ${min}. Your stake was below it.`, minStake: min };
    const limits = [t.stopLoss ? 'stop loss' : '', t.takeProfit ? 'take profit' : ''].filter(Boolean).join(' / ');
    return {
        text: limits ? `${why} Your stake is fine; it is your ${limits} that is too small. Raise it, or leave it empty.` : why,
        minStake: null,
    };
}

export const formatMoney = (n: number | null | undefined, currency = ''): string => {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return `${sign}${Math.abs(n).toFixed(2)}${currency ? ` ${currency}` : ''}`;
};
