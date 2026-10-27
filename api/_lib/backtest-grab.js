// Backtest for the Liquidity Grab Reversal strategy. Pure functions: no network, no database.
// It replays M5 history one closed candle at a time through the SAME analyseGrab the live watcher uses and scores each signal the way a
// Deriv multiplier trade would end: no stop loss, take profit at tpMultiple x the stake (price move tpMultiple/multiplier), and Deriv
// closes the trade when the loss reaches the whole stake (price move 1/multiplier). If one candle reaches both, the stop-out is counted
// first (the worst case), so the numbers are never flattered.
const engine = require('./engine');
const grab = require('./grab');

const TF = 300;
const FIRST = 200; // M5 candles needed before the first analysis
const WINDOW = 900; // M5 candles the analysis sees (about 3 days: enough for the previous day and the Asian session)

/** How one trade ends. entry = close of the touch candle. Returns { status, closedTime, bestPct, worstPct }. */
function scoreTrade(side, entry, after, { multiplier, tpMultiple }, expirySeconds, startTime) {
    const tp = tpMultiple / multiplier;
    const out = 1 / multiplier;
    const dir = side === 'BUY' ? 1 : -1;
    let best = 0;
    let worst = 0;
    for (const c of after) {
        if (c.time - startTime > expirySeconds) return { status: 'expired', closedTime: c.time, bestPct: best * 100, worstPct: worst * 100 };
        const fav = dir === 1 ? c.high / entry - 1 : 1 - c.low / entry;
        const adv = dir === 1 ? 1 - c.low / entry : c.high / entry - 1;
        if (adv >= out) return { status: 'stopout', closedTime: c.time, bestPct: Math.max(best, 0) * 100, worstPct: Math.max(worst, adv) * 100 };
        best = Math.max(best, fav);
        worst = Math.max(worst, adv);
        if (fav >= tp) return { status: 'win', closedTime: c.time, bestPct: best * 100, worstPct: worst * 100 };
    }
    return { status: 'open', closedTime: null, bestPct: best * 100, worstPct: worst * 100 };
}

function runGrabBacktest({ symbol, symbolName, market, m5, cfg, expirySeconds = 86400, cooldownMinutes = 30 }) {
    const kind = engine.marketKind(market);
    const trades = [];
    const seen = new Set();
    if (m5.length < FIRST + 1) return trades;
    let blockedUntil = 0;
    for (let i = FIRST - 1; i < m5.length; i++) {
        const now = m5[i].time + TF;
        if (now < blockedUntil) continue;
        const w = m5.slice(Math.max(0, i - WINDOW + 1), i + 1);
        const r = grab.analyseGrab(w, now, kind);
        if (r.stage !== 'signal' || !r.setupId || seen.has(r.setupId)) continue;
        seen.add(r.setupId);
        const res = scoreTrade(r.side, r.entry, m5.slice(i + 1), cfg, expirySeconds, m5[i].time);
        blockedUntil = Math.max(now + cooldownMinutes * 60, res.closedTime ? res.closedTime + TF : Infinity);
        trades.push({ symbol, symbolName: symbolName || symbol, side: r.side, level: r.levelName, kind: r.kind, time: m5[i].time, entry: r.entry, ...res });
    }
    return trades;
}

const r2 = n => Math.round(n * 100) / 100;

/** Totals in plain numbers. A win earns tpMultiple x the stake, a stop-out loses 1 x the stake. */
function summariseGrab(trades, cfg) {
    const wins = trades.filter(t => t.status === 'win');
    const outs = trades.filter(t => t.status === 'stopout');
    const open = trades.filter(t => t.status === 'open' || t.status === 'expired');
    const decided = wins.length + outs.length;
    const net = wins.length * cfg.tpMultiple - outs.length; // in stakes
    const by = key => {
        const m = {};
        for (const t of trades) {
            const k = t[key];
            m[k] = m[k] || { signals: 0, wins: 0, stopouts: 0, open: 0 };
            m[k].signals++;
            if (t.status === 'win') m[k].wins++;
            else if (t.status === 'stopout') m[k].stopouts++;
            else m[k].open++;
        }
        return m;
    };
    return {
        signals: trades.length,
        wins: wins.length,
        stopouts: outs.length,
        stillOpenOrExpired: open.length,
        winRatePct: decided ? r2((wins.length / decided) * 100) : null,
        breakEvenWinRatePct: r2((1 / (1 + cfg.tpMultiple)) * 100),
        netInStakes: r2(net),
        netPerDecidedTradeInStakes: decided ? r2(net / decided) : null,
        byLevel: by('level'),
        bySide: by('side'),
    };
}

module.exports = { runGrabBacktest, scoreTrade, summariseGrab, FIRST, WINDOW };
