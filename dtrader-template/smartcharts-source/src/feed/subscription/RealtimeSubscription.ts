import { ProposalOpenContract, TGetQuotesRequest } from 'src/types/api-types';
import { TQuote } from 'src/types/props.types';
import { QuoteFormatter } from '../QuoteFormatter';
import Subscription from './Subscription';

class RealtimeSubscription extends Subscription {
    _tickCallback?: (resp: TQuote) => void;

    pause() {
        // prevent forget requests; active streams are invalid when connection closed
        this._tickCallback = undefined;
    }

    async resume() {
        if (this._tickCallback) {
            throw new Error('You cannot resume an active stream!');
        }

        return super.resume();
    }

    async _startSubscribe(getQuotesRequest: TGetQuotesRequest) {
        const contract_info = this.contractInfo as ProposalOpenContract;
        const response = await this._binaryApi.getQuotes(getQuotesRequest);
        const quotes = this._processGetQuotesResponse(response);
        
        // Create a promise that will be resolved when we receive the initial history
        
        // Create the callback function that will handle both history and tick updates
        const processQuote = (resp: TQuote) => {
            // We assume that 1st response is the history, and subsequent
            // responses are tick stream data.
            if (resp.tick || resp.ohlc) {
                this._onTick(resp);
            }
            
            // This is the initial history response
            // tickHistoryPromise.resolve(resp);
        };

        // here we include duration = 'ticks' && exclude duration = 'seconds' which hasn't tick_stream, all_ticks, tick_count (consist of 15-86.400 ticks)
        if (!this.shouldGetQuotes && !!contract_info.tick_stream) {
            this._binaryApi.subscribeQuotes(
                Object.assign(getQuotesRequest, { count: contract_info.tick_count }),
                processQuote
            );
        } else {
            const contract_duration =
                contract_info.current_spot_time && contract_info.date_start
                    ? contract_info.current_spot_time - contract_info.date_start
                    : 0;
            const min_tick_count = 1000;
            this._binaryApi.subscribeQuotes(
                Object.assign(getQuotesRequest, {
                    count: contract_duration > min_tick_count ? contract_duration : min_tick_count,
                }),
                processQuote
            );
        }
        this._tickCallback = processQuote;

        return { quotes, response };
    }

    forget() {
        if (this._tickCallback) {
            const { symbol, granularity } = this._request;
            this._binaryApi.forget({
                symbol,
                granularity,
            });
            this._tickCallback = undefined;
        }

        super.forget();
    }


    _onTick(response: TQuote) {
        // Convert TQuote to a format compatible with getEpochFromTick
        const ticksResponse = response;
        const epoch = Subscription.getEpochFromTick(ticksResponse);
        if (epoch !== undefined) {
            this.lastStreamEpoch = +epoch;
        }
        const quotes = [QuoteFormatter.formatQuote(ticksResponse)];
        this._emitter.emit(Subscription.EVENT_CHART_DATA, quotes);
    }
}

export default RealtimeSubscription;
