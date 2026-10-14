// Sends a message to your Telegram channel/group through the Bot API.
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID live only in Vercel environment variables.

async function sendTelegram(text, { token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID } = {}) {
    if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set');
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || !data || !data.ok) {
        // Never include the token in an error message.
        throw new Error(`Telegram refused the message (${res.status}): ${(data && data.description) || 'no details'}`);
    }
    return { messageId: data.result && data.result.message_id };
}

module.exports = { sendTelegram };
