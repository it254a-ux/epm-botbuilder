// Draws the chart picture that goes to Telegram with a signal.
//
// The website chart is drawn in the visitor's browser, but the signal machine runs on the server
// where there is no browser. So this file draws a similar picture itself: it takes the same
// candles and the same exact levels the analysis produced (range, sweep, break of structure,
// fair value gap, entry, stop loss, take profit), builds an SVG, and turns it into a PNG.
//
// buildChartSvg() is pure (text in, text out) so it is easy to test.
// renderChartPng() needs the @resvg/resvg-js package. If anything goes wrong the caller falls
// back to the plain text message, so a signal is never lost because of the picture.
const fs = require('fs');
const path = require('path');
const { px } = require('./engine');

const W = 1280;
const H = 720;
const M = { left: 24, right: 124, top: 84, bottom: 56 };
const MAX_CANDLES = 70; // how many closed candles to show
const EXTRA_SLOTS = 9; // empty room on the right for the entry / stop / target boxes

const C = {
    bg: '#0e1217',
    panel: '#131920',
    grid: '#1d252f',
    text: '#c9d1d9',
    dim: '#7d8793',
    up: '#26a69a',
    down: '#ef5350',
    buy: '#2ebd85',
    sell: '#f6465d',
    entry: '#4da3ff',
    range: '#f0b90b',
    bos: '#b388ff',
    fvg: '#4da3ff',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = n => (Math.round(n * 10) / 10).toString();
const pad2 = n => String(n).padStart(2, '0');
const hhmm = t => {
    const d = new Date(t * 1000);
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const dayMonth = t => {
    const d = new Date(t * 1000);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
};
const TF_LABELS = { 60: '1m', 120: '2m', 180: '3m', 300: '5m', 600: '10m', 900: '15m', 1800: '30m', 3600: '1h', 7200: '2h', 14400: '4h', 28800: '8h', 86400: '1d' };

/**
 * @param {object} input
 * @param {Array<{time:number,open:number,high:number,low:number,close:number}>} input.candles  closed candles, oldest first
 * @param {object} input.analysis  result of engine.analyse() (range, sweep, bos, fvg, plan, entryTime)
 * @param {object} input.signal    the signal being sent (side, entry, stopLoss, takeProfit, rr, symbolName, strategyName, timeframe)
 * @returns {string} SVG markup
 */
function buildChartSvg({ candles, analysis, signal }) {
    const a = analysis || {};
    const sig = signal;
    const shown = candles.slice(-MAX_CANDLES);
    if (!shown.length) throw new Error('No candles to draw');
    const tf = sig.timeframe || (shown.length > 1 ? shown[1].time - shown[0].time : 900);
    const N = shown.length;
    const firstT = shown[0].time;

    // ---- price range (must include every level so nothing is cut off) ----
    const levels = [sig.entry, sig.stopLoss, sig.takeProfit];
    let lo = Math.min(...shown.map(c => c.low), ...levels);
    let hi = Math.max(...shown.map(c => c.high), ...levels);
    if (a.range) {
        // Include the reference range only if it is reasonably close, so a far-away range cannot flatten the candles.
        const span = hi - lo;
        for (const v of [a.range.high, a.range.low]) {
            if (v >= lo - span * 0.5 && v <= hi + span * 0.5) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
    }
    if (a.sweep && Number.isFinite(a.sweep.extreme)) { lo = Math.min(lo, a.sweep.extreme); hi = Math.max(hi, a.sweep.extreme); }
    if (hi === lo) { hi += Math.abs(hi) * 0.001 || 1; lo -= Math.abs(lo) * 0.001 || 1; }
    const padP = (hi - lo) * 0.06;
    lo -= padP;
    hi += padP;

    const x0 = M.left;
    const x1 = W - M.right;
    const yTop = M.top;
    const yBot = H - M.bottom;
    const slot = (x1 - x0) / (N + EXTRA_SLOTS);
    const bodyW = Math.max(2, Math.min(14, slot * 0.66));
    const yOf = p => yTop + ((hi - p) / (hi - lo)) * (yBot - yTop);
    const idxOf = t => Math.max(0, Math.min(N - 1, Math.floor((t - firstT) / tf)));
    const xOfIdx = i => x0 + (i + 0.5) * slot;
    const xOfTime = t => (t < firstT ? x0 : xOfIdx(idxOf(t)));
    const xEndCandles = x0 + N * slot; // right edge of the last candle
    const xRight = x1; // right edge of the drawing area

    // price decimals for the axis, taken from the entry price
    const entryStr = px(sig.entry);
    const dec = Math.min(6, Math.max(2, (entryStr.split('.')[1] || '').length));
    const fmtAxis = p => p.toFixed(dec);

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, sans-serif">`);
    out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
    out.push(`<rect x="${x0}" y="${yTop}" width="${x1 - x0 + M.right - 12}" height="${yBot - yTop}" fill="${C.panel}"/>`);

    // ---- grid + price axis ----
    const rawStep = (hi - lo) / 7;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rawStep) || rawStep;
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
        const y = yOf(p);
        out.push(`<line x1="${x0}" y1="${n1(y)}" x2="${x1 + 6}" y2="${n1(y)}" stroke="${C.grid}" stroke-width="1"/>`);
        out.push(`<text x="${x1 + 12}" y="${n1(y + 4)}" font-size="13" fill="${C.dim}">${fmtAxis(p)}</text>`);
    }

    // ---- time axis ----
    const every = Math.max(1, Math.round(N / 7));
    for (let i = 0; i < N; i += every) {
        const x = xOfIdx(i);
        out.push(`<line x1="${n1(x)}" y1="${yTop}" x2="${n1(x)}" y2="${yBot}" stroke="${C.grid}" stroke-width="1"/>`);
        const t = shown[i].time;
        const label = hhmm(t) + (hhmm(t) === '00:00' || i === 0 ? ` ${dayMonth(t)}` : '');
        out.push(`<text x="${n1(i === 0 ? x - slot / 2 + 2 : x)}" y="${yBot + 22}" font-size="13" fill="${C.dim}" text-anchor="${i === 0 ? 'start' : 'middle'}">${label}</text>`);
    }

    // ---- reference range (Asian / previous day / ...) ----
    if (a.range) {
        const rx0 = Math.max(x0, xOfTime(a.range.startTime) - slot / 2);
        const yh = yOf(a.range.high);
        const yl = yOf(a.range.low);
        const inView = v => v >= lo && v <= hi;
        if (inView(a.range.high) && inView(a.range.low)) {
            out.push(`<rect x="${n1(rx0)}" y="${n1(yh)}" width="${n1(xEndCandles - rx0)}" height="${n1(yl - yh)}" fill="${C.range}" fill-opacity="0.07"/>`);
        }
        for (const [v, y, word] of [[a.range.high, yh, 'high'], [a.range.low, yl, 'low']]) {
            if (!inView(v)) continue;
            out.push(`<line x1="${n1(rx0)}" y1="${n1(y)}" x2="${n1(xEndCandles)}" y2="${n1(y)}" stroke="${C.range}" stroke-width="1.2" stroke-dasharray="6 5" stroke-opacity="0.85"/>`);
            out.push(`<text x="${n1(rx0 + 6)}" y="${n1(word === 'high' ? y - 6 : y + 15)}" font-size="12" fill="${C.range}">${esc(a.range.label)} ${word}</text>`);
        }
    }

    // ---- fair value gap ----
    if (a.fvg) {
        const fx0 = xOfTime(a.fvg.startTime) - slot / 2;
        const fx1 = Math.min(xEndCandles, xOfTime(a.fvg.endTime) + slot / 2 + slot * 6);
        out.push(`<rect x="${n1(fx0)}" y="${n1(yOf(a.fvg.top))}" width="${n1(Math.max(slot, fx1 - fx0))}" height="${n1(Math.max(2, yOf(a.fvg.bottom) - yOf(a.fvg.top)))}" fill="${C.fvg}" fill-opacity="0.16"/>`);
        out.push(`<text x="${n1(fx0 + 4)}" y="${n1(yOf(a.fvg.top) - 4)}" font-size="11" fill="${C.fvg}">FVG</text>`);
    }

    // ---- candles ----
    shown.forEach((c, i) => {
        const x = xOfIdx(i);
        const up = c.close >= c.open;
        const col = up ? C.up : C.down;
        const yo = yOf(c.open);
        const yc = yOf(c.close);
        out.push(`<line x1="${n1(x)}" y1="${n1(yOf(c.high))}" x2="${n1(x)}" y2="${n1(yOf(c.low))}" stroke="${col}" stroke-width="1.4"/>`);
        out.push(`<rect x="${n1(x - bodyW / 2)}" y="${n1(Math.min(yo, yc))}" width="${n1(bodyW)}" height="${n1(Math.max(1.2, Math.abs(yc - yo)))}" fill="${col}"/>`);
    });

    // ---- sweep ----
    if (a.sweep && Number.isFinite(a.sweep.extreme)) {
        const sx = xOfTime(a.sweep.extremeTime);
        const highSide = a.sweep.side === 'high';
        const sy = yOf(a.sweep.extreme);
        const ty = highSide ? sy - 14 : sy + 24;
        out.push(`<text x="${n1(sx)}" y="${n1(ty)}" font-size="13" font-weight="bold" fill="${C.range}" text-anchor="middle">${highSide ? '▼' : '▲'} Sweep</text>`);
    }

    // ---- break of structure ----
    if (a.bos && Number.isFinite(a.bos.level)) {
        const bx0 = xOfTime(a.bos.swingTime);
        const bx1 = a.bos.bosTime ? xOfTime(a.bos.bosTime) : xEndCandles;
        const by = yOf(a.bos.level);
        out.push(`<line x1="${n1(bx0)}" y1="${n1(by)}" x2="${n1(bx1)}" y2="${n1(by)}" stroke="${C.bos}" stroke-width="1.4" stroke-dasharray="3 4"/>`);
        out.push(`<text x="${n1((bx0 + bx1) / 2)}" y="${n1(by - 6)}" font-size="12" font-weight="bold" fill="${C.bos}" text-anchor="middle">BOS</text>`);
    }

    // ---- entry / stop loss / take profit boxes ----
    const buy = sig.side === 'BUY';
    const entryIdx = a.entryTime ? idxOf(a.entryTime) : N - 1;
    const bx0 = xOfIdx(Math.max(0, entryIdx)) - slot / 2;
    const yE = yOf(sig.entry);
    const yS = yOf(sig.stopLoss);
    const yT = yOf(sig.takeProfit);
    out.push(`<rect x="${n1(bx0)}" y="${n1(Math.min(yE, yT))}" width="${n1(xRight - bx0)}" height="${n1(Math.abs(yT - yE))}" fill="${C.buy}" fill-opacity="0.13"/>`);
    out.push(`<rect x="${n1(bx0)}" y="${n1(Math.min(yE, yS))}" width="${n1(xRight - bx0)}" height="${n1(Math.abs(yS - yE))}" fill="${C.sell}" fill-opacity="0.16"/>`);
    const tag = (y, color, label, value) => {
        out.push(`<line x1="${n1(bx0)}" y1="${n1(y)}" x2="${n1(xRight)}" y2="${n1(y)}" stroke="${color}" stroke-width="1.8"/>`);
        out.push(`<rect x="${x1 + 2}" y="${n1(y - 11)}" width="${M.right - 14}" height="22" rx="3" fill="${color}"/>`);
        out.push(`<text x="${x1 + 8}" y="${n1(y + 5)}" font-size="13" font-weight="bold" fill="#0b0f14">${esc(value)}</text>`);
        out.push(`<text x="${n1(xRight - 8)}" y="${n1(y - 6)}" font-size="12" font-weight="bold" fill="${color}" text-anchor="end">${label}</text>`);
    };
    tag(yT, C.buy, 'TAKE PROFIT', px(sig.takeProfit));
    tag(yE, C.entry, 'ENTRY', px(sig.entry));
    tag(yS, C.sell, 'STOP LOSS', px(sig.stopLoss));

    // ---- header ----
    const sideCol = buy ? C.buy : C.sell;
    out.push(`<rect x="${x0}" y="22" width="92" height="34" rx="6" fill="${sideCol}"/>`);
    out.push(`<text x="${x0 + 46}" y="45" font-size="18" font-weight="bold" fill="#0b0f14" text-anchor="middle">${buy ? 'BUY' : 'SELL'}</text>`);
    out.push(`<text x="${x0 + 108}" y="38" font-size="22" font-weight="bold" fill="${C.text}">${esc(sig.symbolName || sig.symbol || '')} · ${esc(TF_LABELS[sig.timeframe] || `${sig.timeframe}s`)}</text>`);
    out.push(`<text x="${x0 + 108}" y="58" font-size="14" fill="${C.dim}">${esc(sig.strategyName || '')}</text>`);
    out.push(`<text x="${x1 + M.right - 14}" y="38" font-size="20" font-weight="bold" fill="${C.text}" text-anchor="end">Risk : Reward  1 : ${Number(sig.rr).toFixed(2)}</text>`);

    // ---- footer ----
    out.push(`<text x="${x0}" y="${H - 14}" font-size="12" fill="${C.dim}">Times in GMT · Signals only, not financial advice</text>`);
    out.push(`<text x="${x1 + M.right - 14}" y="${H - 14}" font-size="12" fill="${C.dim}" text-anchor="end">Executive Prime Markets</text>`);
    out.push('</svg>');
    return out.join('\n');
}

let fontFiles = null;
function loadFonts() {
    if (fontFiles) return fontFiles;
    const dir = path.join(__dirname, 'fonts');
    fontFiles = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map(f => path.join(dir, f)).filter(f => fs.existsSync(f));
    return fontFiles;
}

/** SVG -> PNG (Buffer). Throws if the renderer or the fonts are not available. */
function svgToPng(svg) {
    // eslint-disable-next-line global-require
    const { Resvg } = require('@resvg/resvg-js');
    const fonts = loadFonts();
    if (!fonts.length) throw new Error('Chart fonts are missing');
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: W },
        font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
    });
    return resvg.render().asPng();
}

function renderChartPng(input) {
    return svgToPng(buildChartSvg(input));
}

module.exports = { buildChartSvg, svgToPng, renderChartPng };
