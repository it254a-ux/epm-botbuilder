import { TProcessedSymbolItem } from './active-symbols.types';

export { TProcessedSymbolItem };

export type TSubCategoryData = TSubCategoryDataItem[];

export type TSubCategoryDataItem = {
    enabled: boolean;
    itemId: string;
    display: string;
    dataObject: TProcessedSymbolItem;
    selected?: boolean;
};

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

export type TCategorizedSymbols = TCategorizedSymbolItem[];

