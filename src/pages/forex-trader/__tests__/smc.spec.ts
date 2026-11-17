import type { Candle } from '../engine';
import { analyseSmc, smcHistory, SMC_ID } from '../smc';

/** [number of candles, price at the end]: straight moves between waypoints, a tiny zig-zag so no flat candles. */
type Path = [number, number][];

function build(path: Path, tail: Path = []): Candle[] {
    const out: Candle[] = [];
    let t = 1_700_000_000;
    let p = path[0][1];
    const push = (o: number, c: number) => {
        out.push({ time: t, open: o, close: c, high: Math.max(o, c) + 0.4, low: Math.min(o, c) - 0.4 });
        t += 300;
    };
    path.forEach(([k, target], seg) => {
        const start = p;
        for (let i = 1; i <= k; i++) {
            const c = start + ((target - start) * i) / k + (seg < path.length && i % 2 ? 0.15 : -0.15);
            push(p, c);
            p = c;
        }
        p = target;
    });
    tail.forEach(([k, target]) => {
        const start = p;
        for (let i = 1; i <= k; i++) {
            const c = start + ((target - start) * i) / k;
            push(p, c);
            p = c;
        }
    });
    return out;
}

/** Gold-style sell: a swing low at 4092, a rally to the 4132 high, a sharp drop (BOS) to 4040, then a climb back to the zone with
 *  two swing highs that get swept, a dip inside the zone (the MSS low at ~4118) and a bounce. */
const SELL: Path = [
    [20, 4100], [6, 4092], [14, 4132], [4, 4131], [4, 4085], [12, 4040], [6, 4062], [4, 4054], [6, 4080], [4, 4072],
    [8, 4102], [4, 4094], [10, 4130], [2, 4131], [4, 4118], [3, 4124],
];
/** The same market turned upside down (every price x -> 8200 - x): the BUY must be the exact mirror of the SELL. */
const flip = (cs: Candle[]): Candle[] => cs.map(c => ({ time: c.time, open: 8200 - c.open, close: 8200 - c.close, high: 8200 - c.low, low: 8200 - c.high }));

describe('Smart money strategy', () => {
    it('is reported under its own id and does nothing on too few candles', () => {
        const a = analyseSmc(build([[10, 100]]), 'forex');
        expect(a.strategyId).toBe(SMC_ID);
        expect(a.state).toBe('no_data');
        expect(a.plan).toBeNull();
    });

    it('waits for a direction when there is no break of structure', () => {
        const flat: Path = [[80, 100]];
        expect(analyseSmc(build(flat), 'forex').state).toBe('waiting_bos');
    });

    it('SELL: marks the zone, the sweeps and the MSS level, and plans the entry before the entry candle', () => {
        const a = analyseSmc(build(SELL), 'forex');
        expect(a.state).toBe('sweep_in_progress');
        const o = a.smc!;
        expect(o.side).toBe('SELL');
        expect(o.zone.label).toBe('SELL ENTRY AREA · SUPPLY ZONE · MITIGATED');
        expect(o.target.label).toBe('SELL SIDE LIQUIDITY 🎯');
        expect(o.major!.label).toBe('MAJOR INDUCEMENT ( TRAP )');
        expect(o.minor!.label).toBe('MINOR INDUCEMENT');
        expect(o.mss!.label).toBe('MSS');
        expect(o.internals.map(i => i.label)).toEqual(['IL-1', 'IL-2']);
        expect(o.internals[0].price).toBeGreaterThan(o.internals[1].price);
        expect(a.plan!.planned).toBe(true);
        expect(a.plan!.stopLoss).toBeGreaterThan(o.zone.top);
        expect(a.plan!.takeProfit).toBe(o.target.price);
        expect(a.plan!.rr).toBeGreaterThan(2);
    });

    it('SELL: a strong red candle closing below the MSS low is the entry, and the target ends the trade', () => {
        const entered = analyseSmc(build(SELL, [[1, 4108]]), 'forex');
        expect(entered.state).toBe('ready');
        expect(entered.entryTime).not.toBeNull();
        expect(entered.plan!.planned).toBe(false);
        const done = analyseSmc(build(SELL, [[1, 4108], [8, 4060], [6, 4038]]), 'forex');
        expect(done.state).toBe('target_reached');
        expect(done.smc!.exit!.kind).toBe('target');
        expect(done.smc!.internals.every(i => i.broken)).toBe(true);
    });

    it('SELL: the stop loss ends the trade as a loss', () => {
        const a = analyseSmc(build(SELL, [[1, 4108], [4, 4112], [3, 4140]]), 'forex');
        expect(a.state).toBe('invalidated');
        expect(a.smc!.exit!.kind).toBe('stop');
    });

    it('shows the entry area (side, zone, stop, target) from the start, before price reaches the zone', () => {
        const early = analyseSmc(build(SELL.slice(0, 6)), 'forex'); // the drop is done, price has not come back yet
        expect(early.state).toBe('waiting_for_sweep');
        expect(early.plan).toBeNull();
        const q = early.smc!.area!;
        expect(early.smc!.side).toBe('SELL');
        expect(early.smc!.zone.label).toBe('SELL ENTRY AREA · SUPPLY ZONE · UNMITIGATED');
        expect(q.stopLoss).toBeGreaterThan(q.entry);
        expect(q.entry).toBeGreaterThan(q.takeProfit);
        const buy = analyseSmc(flip(build(SELL.slice(0, 6))), 'forex');
        expect(buy.smc!.side).toBe('BUY');
        expect(buy.smc!.area!.stopLoss).toBeLessThan(buy.smc!.area!.entry);
        expect(buy.smc!.area!.takeProfit).toBeGreaterThan(buy.smc!.area!.entry);
    });

    it('is live: the candle that is still forming already flips the zone to mitigated when its wick touches it', () => {
        const closed = build(SELL.slice(0, 12)); // price is still well below the zone
        const last = closed[closed.length - 1];
        const forming: Candle = { time: last.time + 300, open: last.close, high: 4131.5, low: last.close - 0.5, close: 4130.2 };
        const before = analyseSmc(closed, 'forex', null);
        const during = analyseSmc(closed, 'forex', forming);
        expect(before.smc!.zone.touched).toBe(false);
        expect(during.smc!.zone.touched).toBe(true);
        expect(during.smc!.zone.label).toBe('SELL ENTRY AREA · SUPPLY ZONE · MITIGATED');
    });

    it('is live but safe: a candle that is still forming never triggers the entry, only a closed one does', () => {
        const closed = build(SELL);
        const last = closed[closed.length - 1];
        const strongRed: Candle = { time: last.time + 300, open: last.close, high: last.close + 0.4, low: 4107.6, close: 4108 };
        expect(analyseSmc(closed, 'forex', strongRed).state).toBe('sweep_in_progress');
        expect(analyseSmc(closed, 'forex', strongRed).entryTime).toBeNull();
        expect(analyseSmc([...closed, strongRed], 'forex').state).toBe('ready');
    });

    it('does not enter on a weak candle that merely pokes below the MSS low', () => {
        const base = build(SELL);
        const last = base[base.length - 1];
        // a long upper wick and a tiny body: it closes below the MSS low, but it is not a strong candle
        const weak: Candle = { time: last.time + 300, open: 4118.6, close: 4117.0, high: 4124.0, low: 4116.0 };
        const a = analyseSmc([...base, weak], 'forex');
        expect(a.state).toBe('sweep_in_progress');
        expect(a.entryTime).toBeNull();
    });

    it('BUY is the exact mirror: demand zone, buy side liquidity, same states and the same risk to reward', () => {
        const sell = analyseSmc(build(SELL, [[1, 4108], [8, 4060], [6, 4038]]), 'forex');
        const buy = analyseSmc(flip(build(SELL, [[1, 4108], [8, 4060], [6, 4038]])), 'forex');
        expect(buy.state).toBe(sell.state);
        expect(buy.smc!.side).toBe('BUY');
        expect(buy.smc!.zone.label).toBe('BUY ENTRY AREA · DEMAND ZONE · MITIGATED');
        expect(buy.smc!.target.label).toBe('BUY SIDE LIQUIDITY 🎯');
        expect(buy.plan!.side).toBe('BUY');
        expect(buy.plan!.rr).toBeCloseTo(sell.plan!.rr, 6);
        expect(buy.plan!.stopLoss).toBeLessThan(buy.plan!.entry);
        expect(buy.plan!.takeProfit).toBeGreaterThan(buy.plan!.entry);
    });

    it('works at any price scale: the rules are measured in ATR, not in fixed prices', () => {
        const scale = (cs: Candle[], f: number): Candle[] => cs.map(c => ({ time: c.time, open: c.open * f, close: c.close * f, high: c.high * f, low: c.low * f }));
        const base = analyseSmc(build(SELL, [[1, 4108]]), 'forex');
        const small = analyseSmc(scale(build(SELL, [[1, 4108]]), 0.00028), 'forex');
        const big = analyseSmc(scale(build(SELL, [[1, 4108]]), 22), 'crypto');
        expect(small.state).toBe(base.state);
        expect(big.state).toBe(base.state);
        expect(small.plan!.rr).toBeCloseTo(base.plan!.rr, 6);
    });

    it('does not analyse old data', () => {
        const cs = build(SELL);
        const a = analyseSmc(cs, 'forex', null, cs[cs.length - 1].time + 300 * 20);
        expect(a.state).toBe('stale');
        expect(a.smc).toBeUndefined();
    });

    it('history: an earlier setup stays on the chart, fixed, and new candles never change it', () => {
        const done: Path = [[1, 4108], [8, 4060], [6, 4038]];
        const short = build(SELL, done);
        const h1 = smcHistory(short);
        expect(h1.length).toBe(1);
        expect(h1[0].side).toBe('SELL');
        expect(h1[0].exit!.kind).toBe('target');
        expect(h1[0].endTime).toBe(h1[0].exit!.time);
        expect(h1[0].plan!.planned).toBe(false);
        // many more candles later: the same setup is still there, identical
        const longer = build(SELL, [...done, [60, 4045], [40, 4030]]);
        const h2 = smcHistory(longer);
        const same = h2.find(h => h.zone.startTime === h1[0].zone.startTime && h.side === 'SELL')!;
        expect(same.key).toBe(h1[0].key);
        expect(same.endTime).toBe(h1[0].endTime);
        // the setup that is current is not repeated in the history
        expect(smcHistory(short, analyseSmc(short, 'forex').smc).length).toBe(0);
    });

    it('history: the BUY side is the mirror', () => {
        const done: Path = [[1, 4108], [8, 4060], [6, 4038]];
        const h = smcHistory(flip(build(SELL, done)));
        expect(h.length).toBe(1);
        expect(h[0].side).toBe('BUY');
        expect(h[0].plan!.stopLoss).toBeLessThan(h[0].plan!.entry);
    });

    it('POC: marks the most-traded price of the drop, mirrored for a BUY', () => {
        const sell = analyseSmc(build(SELL), 'forex').smc!;
        expect(sell.poc).not.toBeNull();
        expect(sell.poc!.price).toBeLessThan(sell.zone.top);
        expect(sell.poc!.price).toBeGreaterThan(sell.target.price);
        expect(['POC', 'POC + ZONE'].includes(sell.poc!.label)).toBe(true);
        const buy = analyseSmc(flip(build(SELL)), 'forex').smc!;
        expect(buy.poc!.price).toBeCloseTo(8200 - sell.poc!.price, 6);
        expect(buy.poc!.label).toBe(sell.poc!.label);
    });
});
