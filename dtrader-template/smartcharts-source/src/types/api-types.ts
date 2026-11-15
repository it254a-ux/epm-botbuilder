// This file contains type definitions that were previously imported from @deriv/api-types
// These types are now defined locally to remove the dependency on the external package

export type ContractStatus = 'open' | 'sold' | 'won' | 'lost' | 'cancelled';

export type SubscriptionInformation = {
    id: string;
};

export type TGetQuotesRequest = {
    symbol: string;
    ticks_history?:string;
    adjust_start_time?: number;
    count?: string | number;
    end?: string;
    granularity?: 60 | 120 | 180 | 300 | 600 | 900 | 1800 | 3600 | 7200 | 14400 | 28800 | 86400;
    start?: string | number;
    style?: 'candles' | 'ticks';
    subscribe?: 0 | 1;
};

export type ActiveSymbols = Array<{
    allow_forward_starting?: 0 | 1;
    delay_amount?: number;
    display_name: string;
    display_order?: number;
    exchange_is_open: 0 | 1;
    exchange_name?: string;
    is_trading_suspended: 0 | 1;
    market: string;
    market_display_name: string;
    pip: number;
    quoted_currency_symbol?: string;
    subgroup: string;
    subgroup_display_name: string;
    submarket: string;
    submarket_display_name: string;
    symbol: string;
    symbol_type: string;
}>;

export type History = {
    prices?: Array<number>;
    times?: Array<number>;
};

export type Candles = Array<{
    close?: number;
    epoch?: number;
    high?: number;
    low?: number;
    open?: number;
}>;

export type TickSpotData = {
    ask?: number;
    bid?: number;
    epoch?: number;
    id?: string;
    pip_size: number;
    quote?: number;
    symbol?: string;
};

export type TicksStreamResponse = {
    tick?: TickSpotData;
};

export type ProposalOpenContract = {
    accrued_interest?: number;
    audit_details?: AuditDetailsForExpiredContract | null;
    barrier_count?: number;
    barrier?: string | null;
    bid_price?: number;
    buy_price?: number;
    contract_id?: number;
    contract_type?: string;
    currency?: string;
    current_spot_high?: number;
    current_spot_low?: number;
    current_spot_time?: number;
    current_spot?: number;
    date_expiry?: number;
    date_settlement?: number;
    date_start?: number;
    display_name?: string;
    display_value?: string;
    entry_spot_display_value?: string | null;
    entry_spot?: number | null;
    entry_tick_display_value?: string | null;
    entry_tick_time?: number | null;
    entry_tick?: number | null;
    exit_tick_display_value?: string | null;
    exit_tick_time?: number | null;
    exit_tick?: number | null;
    expiry_time?: number;
    high_barrier?: string;
    id?: string;
    is_expired?: 0 | 1;
    is_forward_starting?: 0 | 1;
    is_intraday?: 0 | 1;
    is_path_dependent?: 0 | 1;
    is_settleable?: 0 | 1;
    is_sold?: 0 | 1;
    is_valid_to_cancel?: 0 | 1;
    is_valid_to_sell?: 0 | 1;
    low_barrier?: string;
    payout?: number;
    profit?: number;
    profit_percentage?: number;
    purchase_time?: number;
    reset_time?: number;
    sell_price?: number;
    sell_spot_display_value?: string;
    sell_spot_time?: number | null;
    sell_spot?: number | null;
    sell_time?: number | null;
    shortcode?: string;
    status?: ContractStatus | null;
    tick_count?: number;
    tick_stream?: Array<{
        epoch?: number;
        tick?: number | null;
        tick_display_value?: string | null;
    }>;
    transaction_ids?: {
        buy?: number;
        sell?: number;
    };
    underlying?: string;
    validation_error?: string;
    validation_error_code?: string;
};

export type AuditDetailsForExpiredContract = {
    all_ticks?: Array<{
        epoch?: number;
        flag?: string | null;
        name?: string | null;
        tick?: number | null;
        tick_display_value?: string | null;
        quote?: number;
        symbol?: string;
    }>;
    contract_end?: Array<{
        epoch?: number;
        flag?: string | null;
        name?: string | null;
        tick?: number | null;
        tick_display_value?: string | null;
        quote?: number;
        symbol?: string;
    }>;
    contract_start?: Array<{
        epoch?: number;
        flag?: string | null;
        name?: string | null;
        tick?: number | null;
        tick_display_value?: string | null;
        quote?: number;
        symbol?: string;
    }>;
};

export type TServerTime = {
    time: number;
};

export type TradingTimesResponse = {
    trading_times?: {
        markets: Array<{
            name?: string;
            submarkets?: Array<{
                name?: string;
                symbols?: Array<{
                    events: Array<{
                        dates: string;
                        descrip: string;
                    }>;
                    name: string;
                    symbol: string;
                    times: {
                        close: string[];
                        open: string[];
                        settlement: string;
                    };
                    trading_days: string[];
                    feed_license?: string;
                    delay_amount?: number;
                }>;
            }>;
        }>;
    };
    error?: {
        code: string;
        message: string;
    };
};

export type OHLCStreamResponse = {
    ohlc: {
        close: string;
        epoch: number;
        granularity: TGetQuotesRequest['granularity'];
        high: string;
        id: string;
        low: string;
        open: string;
        open_time: number;
        symbol: string;
    };
};


export type TGranularity = 0 | TGetQuotesRequest['granularity'];


export type TError = {
    code?: string;
    message?: string;
};
