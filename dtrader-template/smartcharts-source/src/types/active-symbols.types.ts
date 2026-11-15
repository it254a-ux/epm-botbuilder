export type TProcessedSymbolItem = {
    symbol: string;
    name: string;
    market: string;
    market_display_name: string;
    subgroup: string;
    subgroup_display_name: string;
    submarket_display_name: string;
    exchange_is_open: boolean;
    decimal_places: number;
};

export type TProcessedSymbols = TProcessedSymbolItem[];

export type TSubCategoryDataItem = {
    enabled: boolean;
    itemId: string;
    display: string;
    dataObject: TProcessedSymbolItem;
    selected?: boolean;
};

export type TSubCategoryData = TSubCategoryDataItem[];

export type TSubCategory = {
    subcategoryName: string;
    data: TSubCategoryDataItem[];
};

export type TCategorizedSymbolItem<T = TSubCategory> = {
    categoryName: string;
    categoryId: string;
    hasSubcategory: boolean;
    hasSubgroup: boolean;
    subgroups: TCategorizedSymbolItem[];
    data: T[];
    active?: boolean;
    emptyDescription?: string;
    categorySubtitle?: string;
    categoryNamePostfixShowIfActive?: string;
    categoryNamePostfix?: string;
};

export type TCategorizedSymbols = TCategorizedSymbolItem<TSubCategoryDataItem>[];
