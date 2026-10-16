// Has price actually reached the entry of a waiting setup? Pure function: no network, no database.
//
// A setup that is "ready" on the hourly chart is NOT sent yet. It waits. Every run (about once a minute)
// the minute candles since the setup was formed are looked at:
//   - a minute candle trades through the entry price          -> "touched": the signal can be sent now
//   - that touch is older than the fresh window               -> "missed": too late, the setup is dropped quietly
//   - price reaches the take profit or the stop loss first    -> "cancelled": nobody could have entered, dropped quietly
//   - the same minute touches the entry AND the stop/target   -> "cancelled": it would be over before anyone could act
//   - nothing of the above                                    -> "waiting"
// The minute that is still forming counts too (price may be touching the entry right now).

/**
 * @param {{side:'BUY'|'SELL', entry:number, stopLoss:number, takeProfit:number}} p  the waiting setup
 * @param {{time:number, open:number, high:number, low:number, close:number}[]} minuteCandles  1-minute candles, oldest first
 * @param {number} fromTime  only minutes starting at or after this time (seconds) count: when the setup was formed
 * @param {number} now       seconds
 * @param {number} freshSeconds  a touch older than this (counted from the start of its minute) is "missed"
 * @returns {{status:'waiting'}|{status:'touched', touchTime:number}|{status:'missed', touchTime:number}|{status:'cancelled', reason:string, time:number}}
 */
function checkEntry(p, minuteCandles, fromTime, now, freshSeconds) {
    const buy = p.side === 'BUY';
    for (const c of minuteCandles) {
        if (c.time < fromTime) continue;
        if (![c.high, c.low].every(Number.isFinite)) continue;
        const touches = c.low <= p.entry && c.high >= p.entry;
        const hitSl = buy ? c.low <= p.stopLoss : c.high >= p.stopLoss;
        const hitTp = buy ? c.high >= p.takeProfit : c.low <= p.takeProfit;
        if (touches) {
            if (hitSl || hitTp) return { status: 'cancelled', reason: `Price went through the entry and the ${hitSl ? 'stop loss' : 'take profit'} in the same minute`, time: c.time };
            return now - c.time <= freshSeconds ? { status: 'touched', touchTime: c.time } : { status: 'missed', touchTime: c.time };
        }
        if (hitSl || hitTp) return { status: 'cancelled', reason: `Price reached the ${hitSl ? 'stop loss' : 'take profit'} before the entry`, time: c.time };
    }
    return { status: 'waiting' };
}

module.exports = { checkEntry };
