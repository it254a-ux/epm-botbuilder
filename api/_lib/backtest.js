// Backtest: replays history through the SAME engine and the SAME setup checks the live watcher
// uses, scores every signal with the SAME outcome rules as the results sent to Telegram, and
// summarises what worked and what did not. Pure functions: no network, no database.
//
// Honest limits (also reported in the output): historical news is not replayed, the forming
// candle is not used, and results are only as reliable as the number of trades behind them.
const engine = require('./engine');
const core = require('./signals-core');
const { evaluateSignal } = require('./signal-outcome');

/** Candles needed before the first analysis: the same history the live watcher loads (15 days). */
const historyCandles = tf => Math.ceil((15 * 86400) / tf);

function runBacktest({ symbol, symbolName, market, candles, timeframe, strategies, cfg, filters = {}, expirySeconds = 86400, window = historyCandles(timeframe) }) {
    const tf = timeframe;
    const kind = engine.marketKind(market);
    const trades = [];
    const seen = new Set();
    if (candles.length < window + 1) return trades;
    const endNow = candles[candles.length - 1].time + tf;

    for (let i = window - 1; i < candles.length; i++) {
        const closed = candles.slice(i - window + 1, i + 1);
        const lastClosed = candles[i].time;
        const now = lastClosed + tf;
        for (const strategyId of strategies) {
            const a = engine.analyse(strategyId, closed, kind, null, now);
            if (a.state !== 'ready' || !a.plan) continue;
            const chk = core.setupCheck(a, lastClosed, cfg);
            if (chk.problem) continue;

            const risk = Math.abs(a.plan.entry - a.plan.stopLoss);
            const atr = engine.atr(closed, 14);
            const stopAtr = atr ? risk / atr : null;
            if (filters.minStopAtr && stopAtr !== null && stopAtr < filters.minStopAtr) continue;
            if (filters.maxRr && a.plan.rr > filters.maxRr) continue;

            const key = core.dedupeKey(symbol, strategyId, tf, a.plan.side, a.plan.entry);
            if (seen.has(key)) continue;
            seen.add(key);

            const sig = { symbol, strategyId, timeframe: tf, side: a.plan.side, entry: a.plan.entry, stopLoss: a.plan.stopLoss, takeProfit: a.plan.takeProfit, rr: a.plan.rr, time: lastClosed };
            const outcome = evaluateSignal(sig, candles.slice(i + 1), endNow, expirySeconds);
            trades.push({
                symbol, symbolName: symbolName || symbol, kind, strategyId, strategyName: a.strategyName, side: a.plan.side,
                rr: a.plan.rr, stopAtr, age: chk.age, time: lastClosed, hourUtc: new Date(now * 1000).getUTCHours(),
                status: outcome ? outcome.status : 'open',
            });
        }
    }
    return trades;
}

const round = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * One row of numbers for a set of trades. A trade is DECIDED when it hit take profit or stop loss.
 * winRate = wins / decided. expectancyR = average result per decided trade, in units of the risked
 * amount (a win is +RR, a loss is -1): above 0 is profitable, below 0 loses money.
 */
function summarise(trades) {
    const wins = trades.filter(t => t.status === 'hit_tp');
    const losses = trades.filter(t => t.status === 'hit_sl');
    const decided = wins.length + losses.length;
    const winR = wins.reduce((s, t) => s + t.rr, 0);
    return {
        signals: trades.length,
        decided,
        wins: wins.length,
        losses: losses.length,
        notTriggered: trades.filter(t => t.status === 'not_triggered').length,
        expired: trades.filter(t => t.status === 'expired').length,
        open: trades.filter(t => t.status === 'open').length,
        winRate: decided ? round((wins.length / decided) * 100, 1) : null,
        avgWinRR: wins.length ? round(winR / wins.length) : null,
        expectancyR: decided ? round((winR - losses.length) / decided, 3) : null,
        profitFactor: losses.length ? round(winR / losses.length) : null,
    };
}

function group(trades, keyFn, order) {
    const map = new Map();
    for (const t of trades) {
        const k = keyFn(t);
        if (k === null || k === undefined) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
    }
    const rows = [...map.entries()].map(([name, list]) => ({ name, ...summarise(list) }));
    if (order) return rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    return rows.sort((a, b) => b.decided - a.decided || b.signals - a.signals);
}

const SESSIONS = ['Asia 00-07 GMT', 'London 07-12 GMT', 'New York 12-17 GMT', 'Late 17-24 GMT'];
const sessionOf = h => (h < 7 ? SESSIONS[0] : h < 12 ? SESSIONS[1] : h < 17 ? SESSIONS[2] : SESSIONS[3]);
const RR_BUCKETS = ['RR 2-3', 'RR 3-4', 'RR 4-6', 'RR 6+'];
const rrBucket = rr => (rr < 3 ? RR_BUCKETS[0] : rr < 4 ? RR_BUCKETS[1] : rr < 6 ? RR_BUCKETS[2] : RR_BUCKETS[3]);
const STOP_BUCKETS = ['stop < 0.5 ATR', 'stop 0.5-1 ATR', 'stop 1-1.5 ATR', 'stop 1.5-2.5 ATR', 'stop > 2.5 ATR'];
const stopBucket = x => (x === null ? null : x < 0.5 ? STOP_BUCKETS[0] : x < 1 ? STOP_BUCKETS[1] : x < 1.5 ? STOP_BUCKETS[2] : x < 2.5 ? STOP_BUCKETS[3] : STOP_BUCKETS[4]);

/** Everything the report shows, from a list of trades. */
function buildReport(trades) {
    const overall = summarise(trades);
    const notes = [];
    if (overall.decided < 30) notes.push(`Only ${overall.decided} trades were decided (hit take profit or stop loss). That is too few for reliable conclusions: widen the markets or days before acting on any number below.`);
    notes.push('Not replayed: historical news, and the still-forming candle. Results use the same rules as the results messages in Telegram (a candle touching both stop and target counts as a loss).');
    return {
        overall,
        byStrategy: group(trades, t => `${t.strategyId}. ${t.strategyName}`),
        bySide: group(trades, t => t.side),
        byMarketType: group(trades, t => t.kind),
        bySession: group(trades, t => sessionOf(t.hourUtc), SESSIONS),
        byReward: group(trades, t => rrBucket(t.rr), RR_BUCKETS),
        byStopSize: group(trades, t => stopBucket(t.stopAtr), STOP_BUCKETS),
        byFreshness: group(trades, t => `${t.age} candle${t.age === 1 ? '' : 's'} after the break`),
        bySymbol: group(trades, t => `${t.symbolName} (${t.symbol})`),
        notes,
    };
}

module.exports = { runBacktest, summarise, group, buildReport, historyCandles, sessionOf, rrBucket, stopBucket };
