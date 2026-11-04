import { watchTicks } from '../tick-feed';

const fakeWs = () => {
    const calls: Array<Record<string, unknown>> = [];
    let handler: (d: unknown) => void = () => undefined;
    const unsubscribe = jest.fn();
    return {
        calls,
        unsubscribe,
        push: (d: unknown) => handler(d),
        ws: {
            subscribe: (payload: Record<string, unknown>, h: (d: unknown) => void) => {
                calls.push(payload);
                handler = h;
                return Promise.resolve({ unsubscribe });
            },
        },
    };
};

describe('watchTicks', () => {
    it('opens one stream per market however many parts of the page watch it, and closes it when the last one leaves', async () => {
        const f = fakeWs();
        const a = jest.fn();
        const b = jest.fn();
        const stopA = watchTicks(f.ws, 'frxEURUSD', a);
        const stopB = watchTicks(f.ws, 'frxEURUSD', b);
        await Promise.resolve();
        expect(f.calls).toHaveLength(1);
        f.push({ tick: { quote: 1.1 } });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        stopA();
        expect(f.unsubscribe).not.toHaveBeenCalled();
        stopB();
        expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('a different market gets its own stream', () => {
        const f = fakeWs();
        watchTicks(f.ws, 'frxEURUSD', jest.fn());
        watchTicks(f.ws, 'frxGBPUSD', jest.fn());
        expect(f.calls).toHaveLength(2);
    });
});
