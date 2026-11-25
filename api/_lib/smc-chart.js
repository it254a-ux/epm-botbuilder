// Chart picture for the Smart Money SELL alert. It copies the website chart (Forex Trader, Smart Money strategy) exactly:
// same size (862 x 1000), same zoom (18.8 px per M15 candle, last candle at x=330), same markings and labels.
// Only the candles are different: the latest ones. buildSmcSvg() is pure (text in, text out);
// renderSmcPng() turns it into a PNG with the shared renderer.
const { px } = require('./engine');
const { svgToPng } = require('./signal-chart');

const W = 862;
const H = 1000;
const PLOT = { x0: 0, x1: 765, y0: 127, y1: 945 };
const SLOT = 18.8; // px per M15 candle (the website chart's zoom)
const LAST_X = 330; // centre of the newest candle
const BODY = 8;
const TF = 900;
const C = {
    bg: '#151a24', panel: '#161b27', grid: '#1f2634', text: '#d1d4dc', dim: '#8a8f9c', up: '#2ebd6b', down: '#ef5350',
    zone: '#f0883e', blue: '#3b82f6', orange: '#ff9800', poc: '#d9a7ff', bos: '#22d3ee', sl: '#ef4444', tp: '#22c55e',
    hl: '#3ddc84', lh: '#ff6b6b', now: '#22a85a',
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = n => (Math.round(n * 10) / 10).toString();
const pad2 = n => String(n).padStart(2, '0');
const hhmm = t => `${pad2(new Date(t * 1000).getUTCHours())}:${pad2(new Date(t * 1000).getUTCMinutes())}`;

/**
 * @param {object} input
 * @param {Array} input.candles  M15 candles, oldest first (the last one may still be forming)
 * @param {object} input.result  findSmcSell() result with stage 'touched' (entry, stopLoss, takeProfit, zone, poc, overlay, touchTime)
 * @param {string} input.symbolName
 * @param {object} input.cfg     { multiplier }
 */
function buildSmcSvg({ candles, result: r, symbolName, cfg }) {
    if (!candles.length) throw new Error('No candles to draw');
    const o = r.overlay || {};
    const lastT = candles[candles.length - 1].time;
    const xAt = t => LAST_X + ((t - lastT) / TF) * SLOT;
    const shown = candles.filter(c => xAt(c.time) >= PLOT.x0 - SLOT / 2);
    const N = shown.length;

    const levels = [r.entry, r.stopLoss, r.takeProfit, r.zone.top, r.zone.bottom];
    let lo = Math.min(...shown.map(c => c.low), ...levels);
    let hi = Math.max(...shown.map(c => c.high), ...levels);
    const span = hi - lo || 1;
    hi += span * 0.06;
    lo -= span * 0.1;
    const yOf = p => PLOT.y0 + ((hi - p) / (hi - lo)) * (PLOT.y1 - PLOT.y0);
    const dec = Math.min(6, Math.max(2, (px(r.entry).split('.')[1] || '').length));
    const pr = p => Number(p).toFixed(dec);
    const rr = r.stopLoss > r.entry ? (r.entry - r.takeProfit) / (r.stopLoss - r.entry) : null;

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, sans-serif">`);
    out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);

    // header
    out.push(`<rect x="18" y="26" width="92" height="38" rx="8" fill="#f6465d"/>`);
    out.push(`<text x="64" y="52" font-size="19" font-weight="bold" fill="#0b0f14" text-anchor="middle">SELL</text>`);
    out.push(`<text x="126" y="44" font-size="22" font-weight="bold" fill="${C.text}">${esc(symbolName)} · 15m</text>`);
    out.push(`<text x="126" y="66" font-size="13" fill="${C.dim}">Smart Money: BOS + zone + sweep · price reached the entry</text>`);
    out.push(`<text x="${W - 18}" y="44" font-size="15" font-weight="bold" fill="${C.text}" text-anchor="end">Multiplier ×${cfg.multiplier}</text>`);
    out.push(`<text x="${W - 18}" y="66" font-size="13" fill="${C.dim}" text-anchor="end">stake is the stop</text>`);

    // plot
    out.push(`<rect x="0" y="${PLOT.y0 - 2}" width="${W}" height="${PLOT.y1 - PLOT.y0 + 6}" fill="${C.panel}"/>`);
    const rawStep = (hi - lo) / 18;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 4, 5, 10].map(m => m * mag).find(s => s >= rawStep) || rawStep;
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
        out.push(`<line x1="0" y1="${n1(yOf(p))}" x2="${PLOT.x1}" y2="${n1(yOf(p))}" stroke="${C.grid}"/>`);
        out.push(`<text x="779" y="${n1(yOf(p) + 4)}" font-size="13" fill="${C.dim}">${pr(p)}</text>`);
    }
    // time axis: a label every 90 minutes, also over the empty space on the right
    const tStart = lastT - Math.ceil(LAST_X / SLOT) * TF;
    for (let t = Math.ceil(tStart / 5400) * 5400; xAt(t) < PLOT.x1; t += 5400) {
        const x = xAt(t);
        if (x < 20) continue;
        out.push(`<line x1="${n1(x)}" y1="${PLOT.y0}" x2="${n1(x)}" y2="${PLOT.y1}" stroke="${C.grid}"/>`);
        out.push(`<text x="${n1(x)}" y="${PLOT.y1 + 22}" font-size="13" fill="${C.dim}" text-anchor="middle">${hhmm(t)}</text>`);
    }

    // zone, profit box
    const xz = Math.max(0, xAt(o.zone ? o.zone.startTime : r.touchTime) - SLOT / 2);
    const xBoxEnd = LAST_X + 250;
    out.push(`<rect x="${n1(xz)}" y="${n1(yOf(r.zone.top))}" width="${n1(xBoxEnd - xz)}" height="${n1(Math.max(2, yOf(r.zone.bottom) - yOf(r.zone.top)))}" fill="${C.zone}" fill-opacity="0.22"/>`);
    const xt = Math.max(0, xAt(r.touchTime) - SLOT / 2);
    out.push(`<rect x="${n1(xt)}" y="${n1(yOf(r.entry))}" width="${n1(xBoxEnd - xt)}" height="${n1(yOf(r.takeProfit) - yOf(r.entry))}" fill="#2a8c7a" fill-opacity="0.18"/>`);

    // candles
    shown.forEach(c => {
        const x = xAt(c.time);
        const col = c.close >= c.open ? C.up : C.down;
        out.push(`<line x1="${n1(x)}" y1="${n1(yOf(c.high))}" x2="${n1(x)}" y2="${n1(yOf(c.low))}" stroke="${col}" stroke-width="1.3"/>`);
        out.push(`<rect x="${n1(x - BODY / 2)}" y="${n1(Math.min(yOf(c.open), yOf(c.close)))}" width="${BODY}" height="${n1(Math.max(1.2, Math.abs(yOf(c.close) - yOf(c.open))))}" fill="${col}"/>`);
    });

    // swing tags (HH / HL green, LH / LL red)
    ((o.trend && o.trend.swings) || []).filter(s => xAt(s.time) >= 4).forEach(s => {
        const x = xAt(s.time);
        const col = s.tag === 'HH' || s.tag === 'HL' ? C.hl : C.lh;
        out.push(`<text x="${n1(x)}" y="${n1(s.high ? yOf(s.price) - 9 : yOf(s.price) + 19)}" font-size="13" fill="${col}" text-anchor="middle">${s.tag}</text>`);
    });

    // lines across the chart
    const xLine = PLOT.x1;
    const hline = (p, col, w, dash, x0 = 0, x1 = xLine) => out.push(`<line x1="${n1(x0)}" y1="${n1(yOf(p))}" x2="${n1(x1)}" y2="${n1(yOf(p))}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
    hline(r.stopLoss, C.sl, 1.6, '5 4');
    hline(r.entry, C.blue, 2);
    hline(r.entry, C.orange, 2, '6 6');
    hline(r.takeProfit, C.tp, 1.6, '5 4');
    hline(r.takeProfit, C.tp, 2.2, null, Math.max(0, xt - 6), xBoxEnd);
    if (r.poc) hline(r.poc, C.poc, 2.4, null, xz + 12, xBoxEnd);
    const lastBar = shown[N - 1];
    hline(lastBar.close, '#8a8f9c', 1, '1 4');

    // BOS: solid where it was broken, dotted on to the label
    const labelX = LAST_X + 75;
    if (o.bos) {
        const xb = xAt(o.bos.fromTime);
        const xs = o.bos.toTime ? xAt(o.bos.toTime) : xb + SLOT * 3;
        const y = yOf(o.bos.price);
        out.push(`<line x1="${n1(Math.max(0, xb))}" y1="${n1(y)}" x2="${n1(xs)}" y2="${n1(y)}" stroke="${C.bos}" stroke-width="2.2"/>`);
        out.push(`<line x1="${n1(xs)}" y1="${n1(y)}" x2="${n1(labelX - 4)}" y2="${n1(y)}" stroke="${C.bos}" stroke-width="1.4" stroke-dasharray="1.5 3"/>`);
        out.push(`<text x="${labelX}" y="${n1(y + 4)}" font-size="12" font-weight="bold" fill="${C.bos}">BOS</text>`);
    }
    const note = (p, col, text, dy) => out.push(`<text x="${labelX}" y="${n1(yOf(p) + dy)}" font-size="12" font-weight="bold" fill="${col}" stroke="${C.panel}" stroke-width="3" paint-order="stroke">${esc(text)}</text>`);
    note(r.zone.top, '#f4a46a', 'SELL ENTRY AREA · SUPPLY ZONE · UNMITIGATED', 11);
    if (r.poc) note(r.poc, '#e9c9ff', 'POC + ZONE', -5);
    const yTp = yOf(r.takeProfit);
    note(r.takeProfit, '#ffd54a', 'SELL SIDE LIQUIDITY', -6);
    out.push(`<circle cx="${labelX + 152}" cy="${n1(yTp - 10)}" r="6" fill="none" stroke="#f6465d" stroke-width="1.6"/><circle cx="${labelX + 152}" cy="${n1(yTp - 10)}" r="2.5" fill="#f6465d"/>`);

    // price tags on the right axis: a name box and a price box, never on top of each other
    const tags = [
        { p: r.stopLoss, col: C.sl, name: 'SL (idea fails)', tc: '#fff' },
        { p: r.entry, col: C.blue, name: 'SELL ENTRY AREA', tc: '#fff' },
        { p: r.entry, col: C.orange, name: 'AUTO ENTRY SELL', tc: '#0b0f14' },
        { p: r.takeProfit, col: C.tp, name: `TP · RR 1:${rr ? rr.toFixed(1) : '-'}`, tc: '#0b0f14' },
        { p: lastBar.close, col: C.now, name: '', tc: '#fff' },
    ];
    tags.forEach(t => { t.y = yOf(t.p); });
    tags.sort((a, b) => a.y - b.y); // top to bottom (equal prices keep their order)
    for (let i = tags.length - 2; i >= 0; i--) tags[i].y = Math.min(tags[i].y, tags[i + 1].y - 19);
    tags.forEach(t => {
        const y = t.y;
        if (t.name) {
            const w = Math.round(t.name.length * 7.3 + 16);
            out.push(`<rect x="${PLOT.x1 - w}" y="${n1(y - 9.5)}" width="${w}" height="19" rx="3" fill="${t.col}"/>`);
            out.push(`<text x="${PLOT.x1 - w / 2}" y="${n1(y + 4)}" font-size="11.5" font-weight="bold" fill="${t.tc}" text-anchor="middle">${esc(t.name)}</text>`);
        }
        out.push(`<rect x="${PLOT.x1}" y="${n1(y - 9.5)}" width="${W - PLOT.x1 - 20}" height="19" rx="3" fill="${t.col}"/>`);
        out.push(`<text x="${PLOT.x1 + 7}" y="${n1(y + 4)}" font-size="12.5" font-weight="bold" fill="${t.tc}">${pr(t.p)}</text>`);
    });

    out.push(`<text x="18" y="${H - 8}" font-size="12" fill="${C.dim}">Times in GMT · Signals only, not financial advice</text>`);
    out.push(`<text x="${W - 18}" y="${H - 8}" font-size="12" fill="${C.dim}" text-anchor="end">Executive Prime Markets</text>`);
    out.push('</svg>');
    return out.join('\n');
}

function renderSmcPng(input) {
    return svgToPng(buildSmcSvg(input));
}

module.exports = { buildSmcSvg, renderSmcPng };
