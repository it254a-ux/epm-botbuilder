// Chart picture for the Liquidity Grab Reversal signal: the candles with every step labelled and numbered.
// buildGrabChartSvg() is pure (text in, text out); renderGrabPng() turns it into a PNG with the same renderer as the other signals.
const { px } = require('./engine');
const { svgToPng } = require('./signal-chart');

const W = 1280;
const H = 720;
const M = { left: 24, right: 130, top: 96, bottom: 50 };
const SHOW = 90;
const EXTRA = 10;
const C = { bg: '#0e1217', panel: '#131920', grid: '#1d252f', text: '#c9d1d9', dim: '#7d8793', up: '#26a69a', down: '#ef5350', buy: '#2ebd85', sell: '#f6465d', entry: '#4da3ff', level: '#f0b90b', line: '#ff7a8a', step: '#b388ff' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = n => (Math.round(n * 10) / 10).toString();
const pad2 = n => String(n).padStart(2, '0');
const hhmm = t => `${pad2(new Date(t * 1000).getUTCHours())}:${pad2(new Date(t * 1000).getUTCMinutes())}`;

/**
 * @param {object} input
 * @param {Array} input.candles  closed M5 candles, oldest first
 * @param {object} input.result  GrabResult (stage 'signal')
 * @param {string} input.symbolName
 * @param {object} input.cfg     { multiplier, tpMultiple }
 * @param {object} input.tp      { tpPrice, stopOutPrice } from targets()
 */
function buildGrabChartSvg({ candles, result: r, symbolName, cfg, tp }) {
    if (!candles.length) throw new Error('No candles to draw');
    const start = Math.max(0, Math.min(candles.length - SHOW, candles.findIndex(c => c.time >= (r.footprint.times[0] ?? r.extreme.time)) - 6));
    const shown = candles.slice(start).slice(-SHOW);
    const N = shown.length;
    const firstT = shown[0].time;
    const tf = 300;
    const buy = r.side === 'BUY';

    const levels = [r.stopLine, r.entry];
    if (r.kind !== 'today' && Number.isFinite(r.levelPrice)) levels.push(r.levelPrice);
    let lo = Math.min(...shown.map(c => c.low), ...levels);
    let hi = Math.max(...shown.map(c => c.high), ...levels);
    const padP = (hi - lo) * 0.08 || 1;
    lo -= padP;
    hi += padP;

    const x0 = M.left;
    const x1 = W - M.right;
    const yTop = M.top;
    const yBot = H - M.bottom;
    const slot = (x1 - x0) / (N + EXTRA);
    const bodyW = Math.max(3, Math.min(14, slot * 0.66));
    const yOf = p => yTop + ((hi - p) / (hi - lo)) * (yBot - yTop);
    const idxOf = t => Math.max(0, Math.min(N - 1, Math.floor((t - firstT) / tf)));
    const xOf = i => x0 + (i + 0.5) * slot;
    const xEnd = x0 + N * slot;
    const dec = Math.min(6, Math.max(2, (px(r.entry).split('.')[1] || '').length));

    const o = [];
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, sans-serif">`);
    o.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
    o.push(`<rect x="${x0}" y="${yTop}" width="${x1 - x0 + M.right - 12}" height="${yBot - yTop}" fill="${C.panel}"/>`);

    const rawStep = (hi - lo) / 7;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rawStep) || rawStep;
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
        o.push(`<line x1="${x0}" y1="${n1(yOf(p))}" x2="${x1 + 6}" y2="${n1(yOf(p))}" stroke="${C.grid}"/>`);
        o.push(`<text x="${x1 + 12}" y="${n1(yOf(p) + 4)}" font-size="13" fill="${C.dim}">${p.toFixed(dec)}</text>`);
    }
    const every = Math.max(1, Math.round(N / 8));
    for (let i = 0; i < N; i += every) {
        o.push(`<line x1="${n1(xOf(i))}" y1="${yTop}" x2="${n1(xOf(i))}" y2="${yBot}" stroke="${C.grid}"/>`);
        o.push(`<text x="${n1(xOf(i))}" y="${yBot + 22}" font-size="13" fill="${C.dim}" text-anchor="middle">${hhmm(shown[i].time)}</text>`);
    }

    // key level and stop-hunt line
    const lineTag = (price, color, label, dash) => {
        const y = yOf(price);
        o.push(`<line x1="${x0}" y1="${n1(y)}" x2="${x1}" y2="${n1(y)}" stroke="${color}" stroke-width="1.8"${dash ? ' stroke-dasharray="8 6"' : ''}/>`);
        o.push(`<rect x="${x1 + 2}" y="${n1(y - 11)}" width="${M.right - 14}" height="22" rx="3" fill="${color}"/>`);
        o.push(`<text x="${x1 + 8}" y="${n1(y + 5)}" font-size="13" font-weight="bold" fill="#0b0f14">${price.toFixed(dec)}</text>`);
        o.push(`<text x="${x0 + 8}" y="${n1(y - 7)}" font-size="13" font-weight="bold" fill="${color}">${esc(label)}</text>`);
    };
    if (r.kind !== 'today' && Number.isFinite(r.levelPrice)) lineTag(r.levelPrice, C.level, r.levelName, true);
    lineTag(r.stopLine, C.line, 'STOP-HUNT LINE (the stops sit here)', true);

    shown.forEach((c, i) => {
        const x = xOf(i);
        const col = c.close >= c.open ? C.up : C.down;
        o.push(`<line x1="${n1(x)}" y1="${n1(yOf(c.high))}" x2="${n1(x)}" y2="${n1(yOf(c.low))}" stroke="${col}" stroke-width="1.4"/>`);
        o.push(`<rect x="${n1(x - bodyW / 2)}" y="${n1(Math.min(yOf(c.open), yOf(c.close)))}" width="${n1(bodyW)}" height="${n1(Math.max(1.2, Math.abs(yOf(c.close) - yOf(c.open))))}" fill="${col}"/>`);
    });

    // numbered steps on the candles
    const step1 = r.footprint.times.length ? r.footprint.times[r.footprint.times.length - 1] : null;
    const steps = [];
    const above = !buy; // SELL: labels above the highs; BUY: below the lows
    const add = (n, time, price, text, onTop) => steps.push({ n, time, price, text, onTop });
    if (step1) add(1, step1, buy ? shown[idxOf(step1)].low : shown[idxOf(step1)].high, 'Institutional Footprint', above);
    add(2, r.extreme.time, r.extreme.price, 'First extreme (not traded)', above);
    if (r.pullback) add(3, r.pullback.time, r.pullback.price, 'Pullback', !above);
    add(4, r.touch.time, buy ? r.touch.low : r.touch.high, 'Touch: closes back inside', above);
    steps.forEach(s => {
        const x = xOf(idxOf(s.time));
        const y = yOf(s.price);
        const cy = s.onTop ? y - 26 : y + 26;
        o.push(`<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x)}" y2="${n1(cy)}" stroke="${C.step}" stroke-width="1.2"/>`);
        o.push(`<circle cx="${n1(x)}" cy="${n1(cy)}" r="12" fill="${C.step}"/>`);
        o.push(`<text x="${n1(x)}" y="${n1(cy + 5)}" font-size="14" font-weight="bold" fill="#0b0f14" text-anchor="middle">${s.n}</text>`);
        const anchor = x > x1 - 230 ? 'end' : 'start';
        o.push(`<text x="${n1(anchor === 'end' ? x - 18 : x + 18)}" y="${n1(cy + 5)}" font-size="13" font-weight="bold" fill="${C.step}" text-anchor="${anchor}">${esc(s.text)}</text>`);
    });

    // entry marker and arrow
    const xe = xOf(idxOf(r.touch.time));
    const ye = yOf(r.entry);
    o.push(`<line x1="${n1(xe)}" y1="${n1(ye)}" x2="${n1(xEnd + slot * 2)}" y2="${n1(ye)}" stroke="${C.entry}" stroke-width="1.8"/>`);
    o.push(`<rect x="${x1 + 2}" y="${n1(ye - 11)}" width="${M.right - 14}" height="22" rx="3" fill="${C.entry}"/>`);
    o.push(`<text x="${x1 + 8}" y="${n1(ye + 5)}" font-size="13" font-weight="bold" fill="#0b0f14">${r.entry.toFixed(dec)}</text>`);
    o.push(`<text x="${n1(xEnd + slot * 2 + 6)}" y="${n1(ye + 5)}" font-size="13" font-weight="bold" fill="${C.entry}">5 ENTRY</text>`);
    const ay = buy ? ye - 70 : ye + 70;
    o.push(`<path d="M ${n1(xe + slot)} ${n1(ye)} L ${n1(xe + slot * 3)} ${n1(ay)}" stroke="${C.level}" stroke-width="2.4" stroke-dasharray="6 5" fill="none"/>`);
    o.push(`<text x="${n1(xe + slot * 3 + 8)}" y="${n1(ay + (buy ? -4 : 16))}" font-size="13" fill="${C.level}">expected ${buy ? 'up' : 'down'}</text>`);

    // header
    const sideCol = buy ? C.buy : C.sell;
    o.push(`<rect x="${x0}" y="22" width="92" height="34" rx="6" fill="${sideCol}"/>`);
    o.push(`<text x="${x0 + 46}" y="45" font-size="18" font-weight="bold" fill="#0b0f14" text-anchor="middle">${r.side}</text>`);
    o.push(`<text x="${x0 + 108}" y="38" font-size="22" font-weight="bold" fill="${C.text}">${esc(symbolName)} · 5m</text>`);
    o.push(`<text x="${x0 + 108}" y="60" font-size="14" fill="${C.dim}">Liquidity Grab Reversal · ${esc(r.levelName)} taken</text>`);
    o.push(`<text x="${x1 + M.right - 14}" y="38" font-size="18" font-weight="bold" fill="${C.text}" text-anchor="end">No stop loss · Take profit ${cfg.tpMultiple}× stake</text>`);
    o.push(`<text x="${x1 + M.right - 14}" y="60" font-size="14" fill="${C.dim}" text-anchor="end">At ×${cfg.multiplier}: take profit near ${tp.tpPrice.toFixed(dec)}</text>`);
    o.push(`<text x="${x0}" y="${H - 14}" font-size="12" fill="${C.dim}">Times in GMT · Signals only, not financial advice</text>`);
    o.push(`<text x="${x1 + M.right - 14}" y="${H - 14}" font-size="12" fill="${C.dim}" text-anchor="end">Executive Prime Markets</text>`);
    o.push('</svg>');
    return o.join('\n');
}

function renderGrabPng(input) {
    return svgToPng(buildGrabChartSvg(input));
}

module.exports = { buildGrabChartSvg, renderGrabPng };
