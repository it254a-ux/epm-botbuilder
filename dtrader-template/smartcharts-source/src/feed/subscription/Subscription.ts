import EventEmitter from 'event-emitter-es6';
import { BinaryAPI } from 'src/binaryapi';
import { Listener, TGetQuotesRequest, TGetQuotesResult, TMainStore, TQuote } from 'src/types';
import { QuoteFormatter } from '../QuoteFormatter';

export type TQuoteResponse = { quotes: TQuote[]; response: TGetQuotesResult; error?: unknown };

class Subscription {
    _binaryApi: BinaryAPI;
    _emitter: EventEmitter;
    _request: TGetQuotesRequest;
    lastStreamEpoch?: number;
    _mainStore: TMainStore;
    static get EVENT_CHART_DATA() {
        return 'EVENT_CHART_DATA';
    }
    get contractInfo() {
        return this._mainStore.state.contractInfo;
    }
    get shouldGetQuotes() {
        return this._mainStore.state.shouldGetQuotes || false;
    }

    constructor(request: TGetQuotesRequest, api: BinaryAPI, mainStore: TMainStore) {
        this._binaryApi = api;
        this._request = request;
        this._emitter = new EventEmitter({ emitDelay: 0 });
        this._mainStore = mainStore;
    }

    async initialFetch() {
        const quotes_and_response = await this._startSubscribe(this._request);

        return quotes_and_response;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    pause() {}

    async resume() {
        if (this.lastStreamEpoch) {
            const getQuotesRequest = {
                ...this._request,
                start: this.lastStreamEpoch,
            };

            const quotes_and_response = await this._startSubscribe(getQuotesRequest);

            return quotes_and_response;
        }
    }

    forget() {
        this.lastStreamEpoch = undefined;
        this._emitter.off(Subscription.EVENT_CHART_DATA);
    }

    _startSubscribe(_request: TGetQuotesRequest): Promise<TQuoteResponse> {
        throw new Error('Please override!');
    }

    _processGetQuotesResponse(response: TGetQuotesResult) {

        const quotes = QuoteFormatter.formatHistory(response);

        if (!quotes) {
            const message = `Unexpected response: ${response}`;
            throw new Error(message);
        }

        this.lastStreamEpoch = Subscription.getLatestEpoch(response);

        return quotes;
    }

    onChartData(callback: Listener) {
        this._emitter.on(Subscription.EVENT_CHART_DATA, callback);
    }

    static getLatestEpoch({ candles, history }: TGetQuotesResult) {
        if (candles) {
            return candles[candles.length - 1].epoch as number;
        }

        if (history) {
            const { times = [] } = history;
            return times[times.length - 1];
        }
        
        return undefined;
    }

    static getEpochFromTick(response: TQuote) {
        if ('tick' in response && response.tick) {
            return response.tick.epoch as number;
        }
        return (response as TQuote).ohlc?.open_time;
    }
}

export default Subscription;
