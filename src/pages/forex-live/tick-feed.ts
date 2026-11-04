/**
 * One live price stream per market, shared by everything on the page that wants it (the phone's price bar, the
 * Quotes list, the Price Guard, the profit estimate). Deriv refuses a second stream of the same market on one
 * connection, so every user of a market's price goes through here and the stream is opened once.
 */
type Handler = (data: unknown) => void;
interface Subscribable {
    subscribe: (payload: Record<string, unknown>, handler: (data: unknown) => void) => Promise<{ unsubscribe: () => void }>;
}
interface Feed {
    handlers: Set<Handler>;
    stop: (() => void) | null;
    closed: boolean;
}

const feeds = new WeakMap<object, Map<string, Feed>>();

export function watchTicks(ws: Subscribable, symbol: string, handler: Handler): () => void {
    let bySymbol = feeds.get(ws);
    if (!bySymbol) {
        bySymbol = new Map();
        feeds.set(ws, bySymbol);
    }
    let feed = bySymbol.get(symbol);
    if (!feed) {
        const created: Feed = { handlers: new Set(), stop: null, closed: false };
        feed = created;
        bySymbol.set(symbol, created);
        ws.subscribe({ ticks: symbol }, data => created.handlers.forEach(h => h(data)))
            .then(sub => {
                if (created.closed) sub.unsubscribe();
                else created.stop = sub.unsubscribe;
            })
            .catch(() => {
                // not connected yet: the next user of this market tries again
                created.closed = true;
                if (bySymbol!.get(symbol) === created) bySymbol!.delete(symbol);
            });
    }
    const mine = feed;
    mine.handlers.add(handler);
    return () => {
        mine.handlers.delete(handler);
        if (mine.handlers.size === 0) {
            mine.closed = true;
            mine.stop?.();
            if (bySymbol!.get(symbol) === mine) bySymbol!.delete(symbol);
        }
    };
}
