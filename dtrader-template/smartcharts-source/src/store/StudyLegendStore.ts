import { action, observable, reaction, when, makeObservable } from 'mobx';
import Context from 'src/components/ui/Context';
import { getUniqueId, hexToInt } from 'src/components/ui/utils';
import { TActiveItem, TIndicatorConfig, TSettingsParameter } from 'src/types';
import { set } from '../utils/lodash-lite';
import MainStore from '.';
import { IndicatorCatTrendDarkIcon, IndicatorCatTrendLightIcon } from '../components/IndicatorIcons';
import { getIndicatorsTree, getDefaultIndicatorConfig, STATE, getIndicatorCategoryName } from '../Constant';
import {
    clone,
    flatMap,
    isLiteralObject,
    prepareIndicatorName,
    saveToLocalStorage,
    transformStudiesforTheme,
} from '../utils';
import { LogActions, LogCategories, logEvent } from '../utils/ga';
import MenuStore from './MenuStore';

/**
 * Parameter paths that were corrected after layouts had already been saved with the old
 * spelling.
 *
 * A path is catalogue metadata rather than user data, but it is persisted next to the value,
 * so a stored layout keeps whatever spelling was current when it was saved. These two never
 * matched the keys the chart actually reads, so the bar colours on MACD, ADX, Awesome
 * Oscillator and Gator silently did nothing; rewriting them on restore repairs layouts that
 * predate the fix.
 */
const RENAMED_PARAMETER_PATHS: Record<string, string> = {
    'barStyle.bullishColor': 'barStyle.positiveColor',
    'barStyle.bearishColor': 'barStyle.negativeColor',
};

const migrateParameterPaths = (parameters?: TSettingsParameter[]) =>
    parameters?.forEach(parameter => {
        const renamed = parameter.path && RENAMED_PARAMETER_PATHS[parameter.path];
        if (renamed) parameter.path = renamed;
    });

export default class StudyLegendStore {
    mainStore: MainStore;
    menuStore: MenuStore;
    filterText = '';
    activeItems: TActiveItem[] = [];
    currentHoverIndex: number | undefined | null = null;
    previousHoverIndex: number | undefined | null = null;
    /**
     * Set when something outside the dialog asks to edit an active indicator - the chart's own
     * gear button, or a double-click on an indicator series. The dialog consumes it on open and
     * clears it; see `requestEdit`.
     */
    pendingEditId: string | null = null;

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            filterText: observable,
            activeItems: observable,
            pendingEditId: observable,
            addIndicator: action.bound,
            applyIndicatorSettings: action.bound,
            getDefaultParameters: action.bound,
            updateStyle: action.bound,
            editStudyByIndex: action.bound,
            requestEdit: action.bound,
            clearPendingEdit: action.bound,
            deleteStudy: action.bound,
            deleteStudyById: action.bound,
            deletePredictionStudies: action.bound,
            deleteAllStudies: action.bound,
            setFilterText: action.bound,
            restoreStudies: action.bound,
            getItemById: action.bound,
            setIndicator: action.bound,
            highlightIndicator: action.bound,
            clearHoverItem: action.bound,
        });

        this.mainStore = mainStore;
        when(() => !!this.context, this.onContextReady);
        this.menuStore = new MenuStore(mainStore, { route: 'indicators' });
        reaction(
            () => this.menuStore.open,
            () => {
                if (!this.menuStore.open) {
                    this.setFilterText('');
                    this.clearPendingEdit();
                }
            }
        );
    }

    onContextReady = () => {
        // to remove studies if user has already more than 5

        this.renderLegend();
    };
    get context(): Context | null {
        return this.mainStore.chart.context;
    }

    get items() {
        return [...getIndicatorsTree()].map(indicator => {
            // the only icon which is different on light/dark is trend
            if (indicator.name === 'trend') {
                indicator.icon =
                    this.mainStore.chartSetting.theme === 'light'
                        ? IndicatorCatTrendLightIcon
                        : IndicatorCatTrendDarkIcon;
            }
            return indicator;
        });
    }
    get hasPredictionIndicator() {
        return (this.activeItems || []).filter((item: TActiveItem) => item.isPrediction).length > 0;
    }

    get maxAllowedItem() {
        return this.mainStore.chart.isMobile ? 2 : 5;
    }

    transform = (value: any) => {
        if (typeof value === 'string' && (value.startsWith('#') || value.toLowerCase().startsWith('0x'))) {
            return hexToInt(value);
        }
        if (isLiteralObject(value)) {
            const map = value as Record<string, any>;
            Object.keys(value).forEach(key => {
                map[key] = this.transform(map[key]);
            });
        } else if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                value[i] = this.transform(value[i]);
            }
        }

        return value;
    };

    addOrUpdateIndicator = (activeItem: TActiveItem, index?: number) => {
        const params = activeItem.parameters.reduce((acc, item) => {
            const { path, paths, value } = item;

            if (isLiteralObject(value) && paths) {
                const map = value as Record<string, any>;
                const keys = Object.keys(map);
                keys.forEach(key => {
                    set(acc, paths[key], map[key]);
                });
            } else if (path) {
                set(acc, path, value);
            }

            return acc;
        }, activeItem.config || {});

        const config: TIndicatorConfig = {
            id: activeItem.id,
            name: activeItem.flutter_chart_id,
            title: (activeItem.short_name_and_index + (activeItem.bars ? ` (${activeItem.bars})` : '')).toUpperCase(),
            // The chart composes its on-chart label from the indicator's own
            // short name plus this number, so leaving it unset made every
            // instance of a type render identically ("MACD, MACD, MACD") while
            // the dialog's Active list numbered them. `group_length` is the
            // same counter that list uses, so sending it keeps the two in step.
            number: activeItem.group_length,
            ...this.transform(params),
        };

        this.mainStore.chartAdapter.flutterChart?.app.addOrUpdateIndicator(JSON.stringify(config), index);
    };

    /**
     * Parameters for an indicator, seeded from its defaults and adjusted for the current
     * theme. The redesigned dialog stages these in the settings view before anything is
     * committed, so this hands back a detached copy the caller is free to mutate.
     */
    getDefaultParameters(flutterChartId: string): TSettingsParameter[] {
        const { parameters } = getDefaultIndicatorConfig(flutterChartId) || {};
        if (!parameters) return [];

        const seeded = parameters.map(parameter => ({
            ...parameter,
            value: clone(parameter.defaultValue),
        })) as TSettingsParameter[];

        transformStudiesforTheme(seeded, this.mainStore.chartSetting.theme);
        return seeded;
    }

    /**
     * Adds an indicator using explicit parameters.
     *
     * The dialog walks the user through the settings page before anything reaches the chart,
     * so the values they see are the ones committed here. Passing no parameters falls back to
     * the theme-adjusted defaults.
     */
    addIndicator(flutterChartId: string, parameters?: TSettingsParameter[]) {
        if (this.activeItems.length >= this.maxAllowedItem) return undefined;

        const props = this.getIndicatorProps(flutterChartId);
        const { config } = getDefaultIndicatorConfig(flutterChartId) || {};
        if (!props) return undefined;

        const finalParameters = parameters?.length ? parameters : this.getDefaultParameters(flutterChartId);

        this.changeStudyPanelTitle();
        logEvent(LogCategories.ChartControl, LogActions.Indicator, `Add ${flutterChartId}`);

        const nameObj = prepareIndicatorName(flutterChartId, finalParameters);
        const lastGroupItem = this.findLastActiveItem(flutterChartId);
        const group_length = lastGroupItem ? lastGroupItem.group_length + 1 : 0;

        const item: TActiveItem = {
            ...props,
            group_length,
            short_name_and_index: props.short_name + (group_length ? ` ${group_length}` : ''),
            id: getUniqueId(),
            config,
            parameters: finalParameters,
            bars: nameObj.bars,
        };

        this.addOrUpdateIndicator(item);
        this.activeItems.push(item);

        this.mainStore.state.stateChange(STATE.INDICATOR_ADDED, {
            indicator_type_name: flutterChartId,
            indicators_category_name: getIndicatorCategoryName(flutterChartId),
        });
        this.mainStore.bottomWidgetsContainer.updateChartHeight();
        this.mainStore.state.saveLayout();

        return item;
    }

    /**
     * Commits staged parameters to an already-active indicator, addressed by its id.
     *
     * The dialog owns its own staging and names the target directly. The array index is
     * resolved fresh because it doubles as the Flutter indicator index.
     */
    applyIndicatorSettings(activeItemId: string, parameters: TSettingsParameter[]) {
        const index = this.activeItems.findIndex(item => item.id === activeItemId);
        if (index === -1) return;

        const current = this.activeItems[index];
        const props = this.getIndicatorProps(current.flutter_chart_id);
        const { config } = getDefaultIndicatorConfig(current.flutter_chart_id) || {};
        if (!props) return;

        this.changeStudyPanelTitle();

        const nameObj = prepareIndicatorName(current.flutter_chart_id, parameters);
        const item: TActiveItem = {
            ...props,
            group_length: current.group_length,
            short_name_and_index: props.short_name + (current.group_length ? ` ${current.group_length}` : ''),
            id: activeItemId,
            config,
            parameters,
            bars: nameObj.bars,
        };

        this.activeItems[index] = item;

        this.mainStore.state.stateChange(STATE.INDICATOR_EDITED, {
            indicator_type_name: item.flutter_chart_id,
            indicators_category_name: getIndicatorCategoryName(item.flutter_chart_id),
        });
        this.addOrUpdateIndicator(item, index);
        this.mainStore.state.saveLayout();
    }

    async restoreStudies(activeItems: TActiveItem[]) {
        this.deleteAllStudies();

        activeItems.forEach((activeItem, index) => {
            const props = this.getIndicatorProps(activeItem.flutter_chart_id);

            if (props) {
                migrateParameterPaths(activeItem.parameters);
                this.addOrUpdateIndicator(activeItem);
                Object.assign(activeItem, props);
            } else {
                activeItems.splice(index, 1);
            }
        });

        this.activeItems = activeItems;

        this.mainStore.bottomWidgetsContainer.updateChartHeight();
        this.cleanupPredictionIndicator();
    }

    updateTheme() {
        this.activeItems.forEach((activeItem, index) => {
            transformStudiesforTheme(activeItem.parameters, this.mainStore.chartSetting.theme);
            this.addOrUpdateIndicator(activeItem, index);
        });
        this.mainStore.state.saveLayout();
    }

    // Temporary prevent user from adding more than 5 indicators
    // TODO All traces can be removed after new design for studies
    updateStyle() {
        const should_minimise_last_digit = this.mainStore.studies.activeItems.length > 2;
        this.mainStore.state.setShouldMinimiseLastDigit(should_minimise_last_digit);
    }
    editStudyByIndex(index: number) {
        const activeItem = this.activeItems[index];
        if (activeItem) this.requestEdit(activeItem.id);
    }

    /**
     * Opens the indicators dialog straight onto an active indicator's settings.
     *
     * The dialog stages parameters in local state, so it - not the store - decides what the
     * settings view shows. The request is therefore left here as an id for the dialog to pick
     * up when it mounts, rather than pushed into it.
     */
    requestEdit(activeItemId: string) {
        const study = this.getItemById(activeItemId);
        if (!study) return;

        logEvent(LogCategories.ChartControl, LogActions.Indicator, `Edit ${study.flutter_chart_id}`);
        this.pendingEditId = activeItemId;
        this.menuStore.setOpen(true);
    }

    clearPendingEdit() {
        this.pendingEditId = null;
    }

    deleteStudyById(id: string) {
        const index = this.activeItems.findIndex(item => item.id === id);
        this.mainStore.chartAdapter.flutterChart?.indicators.removeIndicator(index);
        this.deleteStudy(index);
    }
    deleteStudy(index: number) {
        logEvent(LogCategories.ChartControl, LogActions.Indicator, `Remove ${index}`);
        this.mainStore.state.stateChange(STATE.INDICATOR_DELETED, {
            indicator_type_name: this.activeItems[index].flutter_chart_id,
            indicators_category_name: getIndicatorCategoryName(this.activeItems[index].flutter_chart_id),
        });
        this.activeItems.splice(index, 1);
        this.mainStore.bottomWidgetsContainer.updateChartHeight();
        this.renderLegend();
        this.mainStore.state.saveLayout();
    }
    changeStudyPanelTitle() {
        // Remove numbers from the end of indicator titles in mobile
        if (this.mainStore.chart.isMobile) {
            this.mainStore.state.saveLayout();
        }
    }

    /**
     * Gets called continually in the draw animation loop.
     * Be careful not to render unnecessarily. */
    renderLegend = () => {
        if (!this.context) {
            return;
        }
        // Temporary prevent user from adding more than 5 indicators
        // All traces can be removed after new design for studies
        this.updateStyle();
    };

    getIndicatorProps = (indicator: string) => {
        return flatMap(getIndicatorsTree(), collection => collection.items).find(
            item => item?.flutter_chart_id === indicator
        );
    };

    deletePredictionStudies() {
        const filteredItem = this.activeItems.filter(item => item.isPrediction);
        if (filteredItem.length > 0) {
            filteredItem.forEach(item => {
                this.mainStore.state.stateChange(STATE.INDICATOR_DELETED);
                this.deleteStudyById(item.id);
            });
            this.mainStore.state.saveLayout();
        }
    }
    savePredictionStudies() {
        const filteredItem = this.activeItems.filter(item => item.isPrediction);
        if (filteredItem.length > 0) {
            saveToLocalStorage('predictionIndicators', filteredItem);
        }
    }

    cleanupPredictionIndicator() {
        if (localStorage.getItem('predictionIndicators')) {
            localStorage.removeItem('predictionIndicators');
        }
    }
    deleteAllStudies() {
        this.activeItems = [];
        window.flutterChart?.indicators.clearIndicators();
        this.mainStore.state.saveLayout();
    }

    setFilterText(filterText: string) {
        this.filterText = filterText;
        this.mainStore.state.debouncedStateChange(STATE.INDICATOR_SEARCH, { search_string: filterText });
    }

    setIndicator(item: TActiveItem, index: number) {
        this.addOrUpdateIndicator(item, index);
    }

    highlightIndicator(hoverIndex: number | undefined | null) {
        this.currentHoverIndex = hoverIndex;

        if (this.previousHoverIndex === this.currentHoverIndex) {
            return;
        }

        if (typeof this.previousHoverIndex === 'number') {
            this.clearHoverItem(this.previousHoverIndex);
        }

        if (hoverIndex != null) {
            const item = clone(this.activeItems[hoverIndex]);

            if (item && item.config) {
                for (const key in item.config) {
                    if (key.includes('Style')) {
                        item.config[key].thickness = 2;
                        if (key === 'scatterStyle') {
                            item.config[key].radius = 2.5;
                        }
                    }

                    if (key.includes('Styles')) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        item.config[key].forEach((element: any) => {
                            element.thickness = 2;
                        });
                    }
                }
                this.setIndicator(item, hoverIndex);
            }
        }

        this.previousHoverIndex = hoverIndex;
    }

    clearHoverItem(index: number) {
        const item = this.activeItems[index];
        if (item) {
            this.setIndicator(item, index);
        }
    }

    findLastActiveItem(flutter_chart_id: string) {
        for (let i = this.activeItems.length - 1; i >= 0; i--) {
            if (this.activeItems[i].flutter_chart_id === flutter_chart_id) {
                return this.activeItems[i];
            }
        }
    }

    getItemById(id: string) {
        return this.activeItems.find(item => item.id === id);
    }
}
