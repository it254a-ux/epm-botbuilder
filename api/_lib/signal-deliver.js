// Sends one signal to Telegram as a chart picture with the signal text as its caption.
// If the picture cannot be drawn or Telegram refuses it, the plain text message is sent instead,
// so a signal is never lost because of the picture. Shared by the H1 watcher and the M15 + M5 watcher.
// Returns { messageId, picture: true | 'failed: why' }.
const chart = require('./signal-chart');
const { sendTelegram, sendTelegramPhoto } = require('./telegram');

async function deliverSignal(text, chartInput) {
    let why = null;
    try {
        const png = chart.renderChartPng(chartInput);
        const sent = await sendTelegramPhoto(png, text);
        return { messageId: sent.messageId, picture: true };
    } catch (err) {
        why = err.message;
        console.error('signal-deliver: chart picture failed, sending text only:', why);
    }
    const sent = await sendTelegram(text);
    return { messageId: sent.messageId, picture: `failed: ${why}` };
}

module.exports = { deliverSignal };
