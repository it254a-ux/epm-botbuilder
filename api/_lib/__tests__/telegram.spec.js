/** @jest-environment node */
// Tests sending a picture to Telegram (the network call is faked).
const { sendTelegramPhoto } = require('../telegram');

afterEach(() => { delete global.fetch; });

describe('sendTelegram reply', () => {
    const { sendTelegram } = require('../telegram');
    test('replyTo makes it a reply that still sends if the original was deleted', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 5 } }) });
        await sendTelegram('hi', { token: 'T', chatId: '1', replyTo: 42 });
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.reply_parameters).toEqual({ message_id: 42, allow_sending_without_reply: true });
    });
    test('without replyTo nothing about replies is sent', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 5 } }) });
        await sendTelegram('hi', { token: 'T', chatId: '1' });
        expect(JSON.parse(global.fetch.mock.calls[0][1].body).reply_parameters).toBeUndefined();
    });
});

describe('sendTelegramPhoto', () => {
    test('posts the picture and caption to sendPhoto', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 7 } }) });
        const r = await sendTelegramPhoto(Buffer.from([1, 2, 3]), 'hello', { token: 'TKN', chatId: '-100123' });
        expect(r.messageId).toBe(7);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://api.telegram.org/botTKN/sendPhoto');
        expect(init.method).toBe('POST');
        expect(init.body.get('chat_id')).toBe('-100123');
        expect(init.body.get('caption')).toBe('hello');
        expect(init.body.get('parse_mode')).toBe('HTML');
        expect(init.body.get('photo').size).toBe(3);
    });
    test('a caption over 1024 characters is cut, not refused', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) });
        await sendTelegramPhoto(Buffer.from([1]), 'x'.repeat(2000), { token: 'T', chatId: '1' });
        expect(global.fetch.mock.calls[0][1].body.get('caption')).toHaveLength(1024);
    });
    test('an error never contains the bot token', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false, description: 'chat not found' }) });
        await expect(sendTelegramPhoto(Buffer.from([1]), 'c', { token: 'SECRETTOKEN', chatId: '1' })).rejects.toThrow(/chat not found/);
        await sendTelegramPhoto(Buffer.from([1]), 'c', { token: 'SECRETTOKEN', chatId: '1' }).catch(e => expect(e.message).not.toContain('SECRETTOKEN'));
    });
    test('missing settings are reported clearly', async () => {
        await expect(sendTelegramPhoto(Buffer.from([1]), 'c', { token: '', chatId: '' })).rejects.toThrow(/not set/);
    });
});
