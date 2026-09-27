export interface BacktestParams {
    direction: 'under' | 'over';
    threshold: number;
    streakTrigger: number;
    baseStake: number;
    multiplier: number;
    maxSteps: number;
    payoutMultiplier: number;
}

export interface TriggerLogRow {
    n: number;
    tickIndex: number;
    streak: number;
    outcome: 'WIN' | 'RUIN (max steps hit)';
    digit: number;
    stake: string;
    result: string;
    equity: string;
}

export interface BacktestResult {
    equityCurve: number[];
    triggers: number;
    wins: number;
    ruins: number;
    maxDrawdown: number;
    longestLossRun: number;
    finalEquity: number;
    triggerLog: TriggerLogRow[];
}

/** Replays a martingale rule against one historical sample of digits.
 *  Pure function -- no I/O, no randomness beyond the digits it's given. */
export function runMartingaleBacktest(digits: number[], params: BacktestParams): BacktestResult {
    const { direction, threshold, streakTrigger, baseStake, multiplier, maxSteps, payoutMultiplier } = params;
    const qualifies = (d: number) => (direction === 'under' ? d < threshold : d > threshold);

    let equity = 0;
    const equityCurve = [0];
    let streak = 0;
    let inSequence = false;
    let step = 0;
    let stake = baseStake;
    let triggers = 0;
    let wins = 0;
    let ruins = 0;
    let longestLossRun = 0;
    let curLossRun = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const triggerLog: TriggerLogRow[] = [];
    let curTriggerStartIndex = 0;
    let curTriggerStartStreak = 0;

    for (let i = 0; i < digits.length; i++) {
        const d = digits[i];

        if (!inSequence) {
            streak = qualifies(d) ? 0 : streak + 1;
            if (streak >= streakTrigger) {
                inSequence = true;
                step = 0;
                stake = baseStake;
                triggers++;
                curLossRun = 0;
                curTriggerStartIndex = i;
                curTriggerStartStreak = streak;
            }
            continue;
        }

        const win = qualifies(d);
        if (win) {
            equity += stake * (payoutMultiplier - 1);
            wins++;
            inSequence = false;
            streak = 0;
            curLossRun = 0;
            triggerLog.push({
                n: triggers,
                tickIndex: curTriggerStartIndex,
                streak: curTriggerStartStreak,
                outcome: 'WIN',
                digit: d,
                stake: stake.toFixed(2),
                result: '+' + (stake * (payoutMultiplier - 1)).toFixed(2),
                equity: equity.toFixed(2),
            });
        } else {
            equity -= stake;
            curLossRun++;
            if (curLossRun > longestLossRun) longestLossRun = curLossRun;
            step++;
            if (step >= maxSteps) {
                ruins++;
                inSequence = false;
                streak = 0;
                curLossRun = 0;
                triggerLog.push({
                    n: triggers,
                    tickIndex: curTriggerStartIndex,
                    streak: curTriggerStartStreak,
                    outcome: 'RUIN (max steps hit)',
                    digit: d,
                    stake: stake.toFixed(2),
                    result: '-' + stake.toFixed(2),
                    equity: equity.toFixed(2),
                });
            } else {
                stake *= multiplier;
            }
        }

        equityCurve.push(equity);
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return { equityCurve, triggers, wins, ruins, maxDrawdown, longestLossRun, finalEquity: equity, triggerLog };
}
