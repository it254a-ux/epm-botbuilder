import { ActiveSymbols as TActiveSymbols } from '../types/api-types';
import { TProcessedSymbols, TProcessedSymbolItem, TCategorizedSymbols } from '../types/active-symbols.types';
import { TSubCategory, TSubCategoryDataItem, TCategorizedSymbolItem } from '../types/categorical-display.types';

// Helper function for stable sort
export function stableSort<T>(array: T[], compareFn: (a: T, b: T) => number): T[] {
    return array
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const order = compareFn(a.item, b.item);
            return order !== 0 ? order : a.index - b.index;
        })
        .map(({ item }) => item);
}

// Helper functions for processing symbols
export const processSymbols = (symbols: TActiveSymbols): TProcessedSymbols => {
    const processedSymbols: TProcessedSymbols = [];

    // Stable sort is required to retain the order of the symbol name
    const sortedSymbols = stableSort(symbols, (a, b) =>
        a.submarket_display_name.localeCompare(b.submarket_display_name)
    );

    for (const s of sortedSymbols) {
        processedSymbols.push({
            symbol: s.symbol,
            name: s.display_name,
            market: s.market,
            market_display_name: s.market_display_name,
            subgroup: s.subgroup,
            subgroup_display_name: s.subgroup_display_name,
            submarket_display_name: s.submarket_display_name,
            exchange_is_open: !!s.exchange_is_open,
            decimal_places: s.pip.toString().length - 2,
        });
    }
    return processedSymbols;
};

/**
 * Creates a symbol data item for categorization
 */
const createSymbolDataItem = (symbol: TProcessedSymbolItem): TSubCategoryDataItem => ({
    enabled: true,
    itemId: symbol.symbol,
    display: symbol.name,
    dataObject: symbol,
});

/**
 * Creates a new subcategory structure
 */
const createSubcategory = (symbol: TProcessedSymbolItem): TSubCategory => ({
    subcategoryName: symbol.submarket_display_name,
    data: [],
});

/**
 * Creates a new category structure
 */
const createCategory = (symbol: TProcessedSymbolItem): TCategorizedSymbolItem<TSubCategoryDataItem> => ({
    categoryName: symbol.market_display_name,
    categoryId: symbol.market,
    hasSubcategory: true,
    hasSubgroup: !!(symbol.subgroup && symbol.subgroup !== 'none'),
    data: [],
    subgroups: [],
});

/**
 * Creates a new subgroup structure
 */
const createSubgroup = (symbol: TProcessedSymbolItem): TCategorizedSymbolItem => ({
    data: [],
    categoryName: symbol.subgroup_display_name,
    categoryId: symbol.subgroup,
    hasSubcategory: true,
    hasSubgroup: false,
    subgroups: [],
});

/**
 * Finds or creates a category in the categorized symbols array
 */
const findOrCreateCategory = (
    categorizedSymbols: TCategorizedSymbols,
    symbol: TProcessedSymbolItem
): TCategorizedSymbolItem<TSubCategoryDataItem> => {
    let category = categorizedSymbols.find(cat => cat.categoryId === symbol.market);

    if (!category) {
        category = createCategory(symbol);
        categorizedSymbols.push(category);
    }

    return category;
};

/**
 * Finds or creates a subcategory within a category
 */
const findOrCreateSubcategory = (
    category: TCategorizedSymbolItem<TSubCategoryDataItem>,
    symbol: TProcessedSymbolItem,
    subcategoryMap: Map<string, TSubCategory>
): TSubCategory => {
    let subcategory = subcategoryMap.get(symbol.submarket_display_name);

    if (!subcategory) {
        subcategory = createSubcategory(symbol);
        subcategoryMap.set(symbol.submarket_display_name, subcategory);
        // Type assertion needed due to the complex generic type structure
        category.data.push(subcategory as unknown as TSubCategoryDataItem);
    }

    return subcategory;
};

/**
 * Finds or creates a subgroup within a category
 */
const findOrCreateSubgroup = (
    category: TCategorizedSymbolItem<TSubCategoryDataItem>,
    symbol: TProcessedSymbolItem
): TCategorizedSymbolItem => {
    let subgroup = category.subgroups?.find(sg => sg.categoryId === symbol.subgroup);

    if (!subgroup) {
        subgroup = createSubgroup(symbol);
        category.subgroups?.push(subgroup);
    }

    return subgroup;
};

/**
 * Finds or creates a subcategory within a subgroup
 */
const findOrCreateSubgroupSubcategory = (
    subgroup: TCategorizedSymbolItem,
    symbol: TProcessedSymbolItem
): TSubCategory => {
    let subcategory = subgroup.data.find(
        (item: TSubCategory) => item.subcategoryName === symbol.submarket_display_name
    ) as TSubCategory;

    if (!subcategory) {
        subcategory = createSubcategory(symbol);
        subgroup.data.push(subcategory);
    }

    return subcategory;
};

/**
 * Processes subgroup logic for a symbol
 */
const processSubgroup = (
    category: TCategorizedSymbolItem<TSubCategoryDataItem>,
    symbol: TProcessedSymbolItem
): void => {
    if (!category.hasSubgroup) return;

    const subgroup = findOrCreateSubgroup(category, symbol);
    const subgroupSubcategory = findOrCreateSubgroupSubcategory(subgroup, symbol);

    // Add symbol to subgroup subcategory
    subgroupSubcategory.data.push(createSymbolDataItem(symbol));
};

/**
 * Categorizes active symbols into a hierarchical structure
 *
 * This function organizes symbols by:
 * 1. Market (main category)
 * 2. Submarket (subcategory)
 * 3. Subgroup (optional nested grouping)
 *
 * It ensures no duplicate categories are created by checking existing
 * categories before creating new ones.
 */
export const categorizeActiveSymbols = (activeSymbols: TProcessedSymbols): TCategorizedSymbols => {
    if (!activeSymbols.length) return [];

    const categorizedSymbols: TCategorizedSymbols = [];
    // Track subcategories for each category to avoid duplicates
    const categorySubcategories = new Map<string, Map<string, TSubCategory>>();

    for (const symbol of activeSymbols) {
        // Step 1: Find or create the main category
        const category = findOrCreateCategory(categorizedSymbols, symbol);

        // Step 2: Initialize subcategory tracking for new categories
        if (!categorySubcategories.has(symbol.market)) {
            categorySubcategories.set(symbol.market, new Map());
        }

        const subcategoryMap = categorySubcategories.get(symbol.market)!;

        // Step 3: Find or create the subcategory
        const subcategory = findOrCreateSubcategory(category, symbol, subcategoryMap);

        // Step 4: Process subgroup logic if applicable
        processSubgroup(category, symbol);

        // Step 5: Add symbol to the main subcategory
        subcategory.data.push(createSymbolDataItem(symbol));
    }

    return categorizedSymbols;
};
