// Backtest: replays history through the SAME engine and the SAME setup checks the live watcher
// uses, scores every signal with the SAME outcome rules as the results sent to Telegram, and
// summarises what worked and what did not. Pure functions: no network, no database.
//
// Honest limits (also reported in the output): historical news is not replayed, the forming
// candle is not used, and results are only as reliable as the number of trades behind them.
const engine = require('./engine');
const core = require('./signals-core');
const { evaluateSignal } = require('./signal-outcome');
const mtfLib = require('./mtf');

/** Candles needed before the first analysis: the same history the live watcher loads (15 days). */
const historyCandles = tf => Math.ceil((15 * 86400) / tf);

function runBacktest({ symbol, symbolName, market, candles, timeframe, strategies, cfg, expirySeconds = 86400, window = historyCandles(timeframe) }) {
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
            const atr = engine.atr(closed, 14);
            const chk = core.setupCheck(a, lastClosed, cfg, atr);
            if (chk.problem) continue;

            const risk = Math.abs(a.plan.entry - a.plan.stopLoss);
            const stopAtr = atr ? risk / atr : null;

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

/** The M15 + M5 mode is stored with this strategy number (the H1 strategies are 1-5). Same as the live machine. */
const MTF_STRATEGY_ID = 100;
const MTF_STRATEGY_NAME = 'M15 analysis + M5 entry';
const MTF_TF = 300;
const MTF_FIRST = 100; // M5 candles needed before the first analysis

/**
 * Replays M5 + M15 history through the SAME analyseMtf the live machine and the Forex Trader page use, one closed M5 candle at
 * a time (each step sees only what was closed at that moment). Every confirmed BUY/SELL is scored with the same outcome rules as the
 * live results (entry = the close of the last closed M5 candle). One signal per setup, like the live machine.
 */
function runMtfBacktest({ symbol, symbolName, market, m5, m15, expirySeconds = 86400 }) {
    const kind = engine.marketKind(market);
    const trades = [];
    const seen = new Set();
    if (m5.length < MTF_FIRST + 1 || m15.length < mtfLib.MIN_M15_CANDLES) return trades;
    const endNow = m5[m5.length - 1].time + MTF_TF;
    let j = -1; // newest M15 candle that was closed at "now"
    for (let i = MTF_FIRST - 1; i < m5.length; i++) {
        const now = m5[i].time + MTF_TF;
        while (j + 1 < m15.length && m15[j + 1].time + mtfLib.M15_SEC <= now) j++;
        if (j + 1 < mtfLib.MIN_M15_CANDLES) continue;
        const m5w = m5.slice(Math.max(0, i - 299), i + 1);
        const m15w = m15.slice(Math.max(0, j - 399), j + 1);
        const r = mtfLib.analyseMtf(m15w, m5w, now);
        if (r.signal === 'WAIT' || !r.plan || !r.setupId) continue;
        if (seen.has(r.setupId)) continue;
        seen.add(r.setupId);
        const atr = engine.atr(m5w, 14);
        const sig = { symbol, strategyId: MTF_STRATEGY_ID, timeframe: MTF_TF, side: r.plan.side, entry: r.plan.entry, stopLoss: r.plan.stopLoss, takeProfit: r.plan.takeProfit, rr: r.plan.rr, time: m5[i].time };
        const outcome = evaluateSignal(sig, m5.slice(i + 1), endNow, expirySeconds);
        trades.push({
            symbol, symbolName: symbolName || symbol, kind, strategyId: MTF_STRATEGY_ID, strategyName: MTF_STRATEGY_NAME, side: r.plan.side,
            rr: r.plan.rr, stopAtr: atr ? r.plan.risk / atr : null, age: 0, time: m5[i].time, hourUtc: new Date(now * 1000).getUTCHours(),
            status: outcome ? outcome.status : 'open',
        });
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
        // Setups price actually reached (entered): with entry-touch on (the default) only these are sent to Telegram.
        touched: decided + trades.filter(t => t.status === 'expired').length,
        expired: trades.filter(t => t.status === 'expired').length,
        open: trades.filter(t => t.status === 'open').length,
        touchRate: (() => {
            const touched = decided + trades.filter(t => t.status === 'expired').length;
            const never = trades.filter(t => t.status === 'not_triggered').length;
            return touched + never ? round((touched / (touched + never)) * 100, 1) : null;
        })(),
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

/** "2026 Q3" for a candle time: lets you see whether a pattern holds in every stretch of time or only in one. */
const quarterOf = t => { const d = new Date(t * 1000); return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };

/**
 * "What if" rows: the same trades with one rule added, so you can see what each rule would have done.
 * Careful: a rule picked after looking at the results always looks good on those same results.
 * Only trust it if it also helps in most periods and in markets that were not used to choose it.
 */
const WHAT_IF = [
    ['All trades in this run', () => true],
    ['Only stops of at least 0.5 ATR', t => t.stopAtr !== null && t.stopAtr >= 0.5],
    ['Only stops of at least 1 ATR', t => t.stopAtr !== null && t.stopAtr >= 1],
    ['Only stops of at least 1.5 ATR', t => t.stopAtr !== null && t.stopAtr >= 1.5],
    ['Only reward of 6 or less', t => t.rr <= 6],
    ['Stops of at least 1 ATR AND reward of 6 or less', t => t.stopAtr !== null && t.stopAtr >= 1 && t.rr <= 6],
];

/** Everything the report shows, from a list of trades. */
function buildReport(trades) {
    const overall = summarise(trades);
    const notes = [];
    if (overall.decided < 30) notes.push(`Only ${overall.decided} trade${overall.decided === 1 ? ' was' : 's were'} decided (hit take profit or stop loss). That is too few for reliable conclusions: add markets or days (up to &days=730) before acting on any number below.`);
    notes.push('Spreads, commissions and slippage are NOT included: real results are lower than shown. A result near 0R here is a loss in real trading.');
    notes.push('The whatIf rows were not planned before seeing the data. Only trust a rule if it also helps in most periods (see stopAtLeast1ByPeriod) and in markets you did not use to choose it.');
    notes.push('Entry touch: with the default setting a signal is sent only after price reaches the entry. "touched" counts the setups price reached (these would have been sent); "notTriggered" are setups that never reached their entry (these would NOT have been sent); touchRate is touched / (touched + notTriggered). Wins and losses are the same either way.');
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
        whatIf: WHAT_IF.map(([name, keep]) => ({ name, ...summarise(trades.filter(keep)) })),
        stopAtLeast1ByPeriod: group(trades.filter(t => t.stopAtr !== null && t.stopAtr >= 1), t => quarterOf(t.time)).sort((a, b) => a.name.localeCompare(b.name)),
        byPeriod: group(trades,  t => quarterOf(t.time)).sort((a, b) => a.name.localeCompare(b.name)),
        bySymbol: group(trades, t => `${t.symbolName} (${t.symbol})`),
        notes,
    };
}

module.exports = { runMtfBacktest, runBacktest, summarise, group, buildReport, quarterOf, historyCandles, sessionOf, rrBucket, stopBucket };
