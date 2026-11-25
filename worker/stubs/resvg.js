// PNG renderer for Cloudflare Workers (the native @resvg/resvg-js cannot run here, so this uses the WebAssembly build).
// Same small API the chart code uses: new Resvg(svg, options).render().asPng(). Call `await ready()` once before the first
// picture is drawn; if anything is missing the signal sender falls back to a plain text message.
import { initWasm, Resvg as WasmResvg } from '@resvg/resvg-wasm';
import wasmModule from '@resvg/resvg-wasm/index_bg.wasm';
import fontRegular from '../../api/_lib/fonts/DejaVuSans.ttf';
import fontBold from '../../api/_lib/fonts/DejaVuSans-Bold.ttf';

let started = null;
export function ready() {
    if (!started) started = initWasm(wasmModule).catch(err => { started = null; throw err; });
    return started;
}

let fonts = null;
export class Resvg {
    constructor(svg, options = {}) {
        if (!fonts) fonts = [new Uint8Array(fontRegular), new Uint8Array(fontBold)];
        const font = options.font || {};
        this.inner = new WasmResvg(svg, {
            fitTo: options.fitTo,
            font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: font.defaultFontFamily || 'DejaVu Sans' },
        });
    }
    render() { return this.inner.render(); }
}
Resvg.bundledFonts = true;
