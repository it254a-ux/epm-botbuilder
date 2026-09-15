// Bridges dtrader's ported hooks (useActiveSymbols, useTicks, useProposal,
// useBuy) to bot-builder's own shared WebSocket connection.
//
// dtrader's hooks were written against a small `DerivWS` class with two
// methods: `send<T>(payload)` and `subscribe(payload, callback)`, where
// `subscribe` returned a per-request filtered stream. Bot-builder's own
// api_base has no such per-request `.subscribe()` — its underlying API
// object only exposes a single shared `onMessage()` stream of every
// incoming message (see bot-skeleton's own Proposal.js / Ticks.js, which
// call `api_base.api.onMessage().subscribe(response => { if
// (response.data.msg_type === '...') {...} })` and register the result via
// `api_base.pushSubscription()` for centralized cleanup).
//
// This adapter reproduces dtrader's original `send`/`subscribe` interface
// on top of that same real pattern, so the ported hooks' own internals
// don't need to change: `send()` forwards straight to api_base.api.send()
// (a real Promise despite bot-builder's own TApiBaseApi type declaring it
// `void` — see contracts-for.js, which already awaits it the same way),
// and `subscribe()` filters bot-builder's shared onMessage() stream down to
// just the messages that belong to this particular request.
import { api_base } from '@/external/bot-skeleton/services/api/api-base';

export interface ApiWsHandle {
    send<T = unknown>(payload: Record<string, unknown>): Promise<T>;
    subscribe(
        payload: Record<string, unknown>,
        onData: (data: unknown) => void
    ): Promise<{ unsubscribe: () => void }>;
    /**
     * Listens to every incoming message on bot-builder's shared connection
     * (e.g. used to surface WS-level errors as toasts). Mirrors dtrader's
     * original DerivWS.onMessage(handler): () => void exactly, so callers
     * that use its return value directly as a useEffect cleanup function
     * keep working unchanged.
     */
    onMessage(handler: (data: Record<string, unknown>) => void): () => void;
}

/**
 * Only `ticks` and `proposal` requests are ever passed to subscribe() by
 * the ported hooks (useTicks, useProposal) — useBuy and useActiveSymbols
 * only ever call send(). Deriv's API convention is that a streamed
 * response's `msg_type` matches the request key (a `ticks` request streams
 * back `msg_type: 'tick'`; a `proposal` request streams back `msg_type:
 * 'proposal'`), so the request key alone tells us which stream to filter
 * bot-builder's shared onMessage() down to.
 */
function resolveMsgType(payload: Record<string, unknown>): 'tick' | 'proposal' | null {
    if ('ticks' in payload) return 'tick';
    if ('proposal' in payload) return 'proposal';
    return null;
}

/**
 * Because onMessage() is shared across the whole app, a bare msg_type
 * filter isn't enough when more than one ticks/proposal subscription is
 * live at once (e.g. Rise/Fall, Digits, and Accumulators tabs can each hold
 * their own open subscription for a different symbol/contract). This
 * narrows further using the fields Deriv actually echoes back:
 * tick.symbol for ticks, and echo_req's own request fields for proposals.
 */
function matchesRequest(payload: Record<string, unknown>, msgType: 'tick' | 'proposal', data: any): boolean {
    if (msgType === 'tick') {
        return data?.tick?.symbol === payload.ticks;
    }
    // proposal
    const echo = data?.echo_req;
    if (!echo) return false;
    return (
        echo.contract_type === payload.contract_type &&
        echo.underlying_symbol === payload.underlying_symbol &&
        echo.amount === payload.amount &&
        echo.basis === payload.basis &&
        echo.duration === payload.duration &&
        echo.duration_unit === payload.duration_unit &&
        echo.date_expiry === payload.date_expiry &&
        echo.barrier === payload.barrier
    );
}

/**
 * Thin wrapper — every call is forwarded live to api_base.api, so this
 * object never goes stale even though it's created once per hook mount.
 * Connection status itself is reactive and lives separately, in
 * `connectionStatus$` (see use-deriv-ws.ts) — not on this object, since a
 * plain property here wouldn't trigger re-renders when it changes.
 */
export function createApiWsHandle(): ApiWsHandle {
    return {
        send<T>(payload: Record<string, unknown>): Promise<T> {
            if (!api_base.api) return Promise.reject(new Error('Not connected'));
            // api_base's own TApiBaseApi type declares send() as returning
            // void, but the underlying deriv-api client's send() is a real
            // Promise — bot-skeleton's own contracts-for.js already relies
            // on this (`const response = await api_base.api.send(...)`).
            return api_base.api.send(payload) as unknown as Promise<T>;
        },
        subscribe(payload, onData) {
            if (!api_base.api) return Promise.reject(new Error('Not connected'));

            const msgType = resolveMsgType(payload);

            const subscription = api_base.api.onMessage().subscribe((response: { data: any }) => {
                if (!msgType || response.data?.msg_type !== msgType) return;
                if (!matchesRequest(payload, msgType, response.data)) return;
                onData(response.data);
            });
            // Cast: bot-builder's own CurrentSubscription type declares an
            // `id` field its .js call sites never actually provide either
            // (Proposal.js/Ticks.js pass this same bare RxJS Subscription) —
            // only .unsubscribe() is ever used by clearSubscriptions().
            api_base.pushSubscription(subscription as unknown as Parameters<typeof api_base.pushSubscription>[0]);

            // Fire the actual subscribe request; matching responses arrive
            // through the shared onMessage() stream filtered above.
            // Cast: api_base's TApiBaseApi type wrongly declares send() as
            // void — see the comment on send() above.
            return (api_base.api.send({ ...payload, subscribe: 1 }) as unknown as Promise<unknown>)
                .then(() => ({ unsubscribe: () => subscription.unsubscribe() }))
                .catch(err => {
                    subscription.unsubscribe();
                    throw err;
                });
        },
        onMessage(handler) {
            if (!api_base.api) return () => {};
            const subscription = api_base.api.onMessage().subscribe((response: { data: Record<string, unknown> }) => {
                handler(response.data);
            });
            api_base.pushSubscription(subscription as unknown as Parameters<typeof api_base.pushSubscription>[0]);
            return () => subscription.unsubscribe();
        },
    };
}
