const { signalsPaused } = require('../signals-pause');

describe('signals master switch', () => {
    const saved = process.env.SIGNALS_ENABLED;
    afterEach(() => {
        if (saved === undefined) delete process.env.SIGNALS_ENABLED;
        else process.env.SIGNALS_ENABLED = saved;
    });

    test('paused unless SIGNALS_ENABLED is "on"', () => {
        delete process.env.SIGNALS_ENABLED;
        expect(signalsPaused()).toBe(true);
        process.env.SIGNALS_ENABLED = 'off';
        expect(signalsPaused()).toBe(true);
        process.env.SIGNALS_ENABLED = 'true';
        expect(signalsPaused()).toBe(true);
        process.env.SIGNALS_ENABLED = ' ON ';
        expect(signalsPaused()).toBe(false);
    });

    test('deliverSignal sends nothing while paused', async () => {
        delete process.env.SIGNALS_ENABLED;
        const { deliverSignal } = require('../signal-deliver');
        await expect(deliverSignal('hi', {})).resolves.toEqual({ messageId: null, picture: 'paused' });
    });
});
