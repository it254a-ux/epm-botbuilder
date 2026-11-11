// Cloudflare Workers cannot run the native PNG renderer. The signal sender already falls back
// to a plain text message when the chart picture throws, so a signal is never lost.
class Resvg {
    constructor() {
        throw new Error('Chart pictures are not available on Cloudflare Workers (text signal is sent instead)');
    }
}
module.exports = { Resvg };
