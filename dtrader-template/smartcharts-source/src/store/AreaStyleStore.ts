import { action, computed, makeObservable, observable, reaction, when } from 'mobx';
import {
    AREA_CHART_TYPE_ID,
    AREA_COLORS,
    AREA_FILL,
    AREA_FILLS,
    AREA_THICKNESSES,
    DEFAULT_AREA_COLOR_ID,
    DEFAULT_AREA_FILL,
    DEFAULT_AREA_THICKNESS_ID,
    TAreaColorId,
    TAreaFill,
    TAreaThicknessId,
    getAreaColor,
    getAreaThickness,
} from 'src/constants/areaStyle';
import { TAreaStylePayload } from 'src/types';
import MainStore from '.';
import { createObjectFromLocalStorage, saveToLocalStorage } from '../utils';
import { LogActions, LogCategories, logEvent } from '../utils/ga';

const STORAGE_KEY = 'sc-area-style';

type TPersistedAreaStyle = {
    fill?: TAreaFill;
    colorId?: TAreaColorId;
    thicknessId?: TAreaThicknessId;
    isExpanded?: boolean;
};

/**
 * The Area chart's line colour, line thickness and gradient fill.
 *
 * Deliberately keyed globally rather than per `chartId`, unlike `chart-layout-{id}`: a
 * layout belongs to one chart, but this is a presentational preference. The picker is only
 * reachable from the chart-type dialog, which the trade chart renders and the contract
 * chart does not - keying it per chart would leave the contract chart permanently on the
 * default while the user had chosen otherwise, with no way to change it there.
 *
 * The values are resolved into the engine's `LineStyle` on the Dart side (see
 * `ChartConfigModel.lineStyle`); this store only carries the user's choice and pushes it
 * across, following `CrosshairStore`'s pattern of syncing once the engine reports loaded.
 */
export default class AreaStyleStore {
    mainStore: MainStore;

    fill: TAreaFill = DEFAULT_AREA_FILL;
    colorId: TAreaColorId = DEFAULT_AREA_COLOR_ID;
    thicknessId: TAreaThicknessId = DEFAULT_AREA_THICKNESS_ID;

    /**
     * Whether the picker is disclosed. Presentation rather than chart style, but persisted
     * in the same record: it is the same preference from the user's point of view - someone
     * who adjusts the area often should not have to reopen the section every time, and
     * someone who never touches it should not be given a tall dialog for no reason.
     *
     * Starts closed, so the dialog opens at its compact height until asked otherwise.
     */
    isExpanded = false;

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            fill: observable,
            colorId: observable,
            thicknessId: observable,
            isExpanded: observable,
            hasGradient: computed,
            color: computed,
            thickness: computed,
            payload: computed,
            setFill: action.bound,
            setColor: action.bound,
            setThickness: action.bound,
            toggleExpanded: action.bound,
            collapse: action.bound,
        });

        this.mainStore = mainStore;
        this.restore();

        // The engine reads the style from the `newChart` payload as well, but a warm
        // engine (e.g. mobile Trade -> Menu -> Trade) is not always re-created, so push
        // it once it reports loaded - exactly as the crosshair does.
        when(
            () => this.mainStore.chartAdapter.isChartLoaded,
            () => this.push()
        );

        // Leaving the Area chart closes the section, so coming back to it starts from the
        // heading row again. Without this the disclosure would survive a round trip
        // through a candle type and spring open the moment Area was reselected, which is
        // not what someone switching chart types is asking for.
        reaction(
            () => this.mainStore.chartType.type?.id === AREA_CHART_TYPE_ID,
            isAreaChart => {
                if (!isAreaChart && this.isExpanded) this.collapse();
            }
        );
    }

    /** Whether the area beneath the line is filled with a gradient. */
    get hasGradient() {
        return this.fill === AREA_FILL.GRADIENT;
    }

    /**
     * The selected colour as a hex string, or `undefined` for "Default" - which leaves the
     * engine on its theme's own area colour, so the line stays readable in both themes.
     */
    get color(): string | undefined {
        return getAreaColor(this.colorId).color;
    }

    get thickness() {
        return getAreaThickness(this.thicknessId).thickness;
    }

    /** The shape the engine expects, shared by `newChart` and `updateAreaStyle`. */
    get payload(): TAreaStylePayload {
        return {
            areaLineColor: this.color,
            areaLineThickness: this.thickness,
            areaHasGradient: this.hasGradient,
        };
    }

    setFill(fill: TAreaFill) {
        if (this.fill === fill) return;
        this.fill = fill;
        this.onChanged(`Area fill ${fill}`);
    }

    setColor(colorId: TAreaColorId) {
        if (this.colorId === colorId) return;
        this.colorId = colorId;
        this.onChanged(`Area color ${colorId}`);
    }

    setThickness(thicknessId: TAreaThicknessId) {
        if (this.thicknessId === thicknessId) return;
        this.thicknessId = thicknessId;
        this.onChanged(`Area thickness ${thicknessId}`);
    }

    toggleExpanded() {
        this.setExpanded(!this.isExpanded);
        logEvent(
            LogCategories.ChartControl,
            LogActions.ChartType,
            `Area settings ${this.isExpanded ? 'expanded' : 'collapsed'}`
        );
    }

    /** Closed on the way out of the Area chart type - not a user action, so not logged. */
    collapse() {
        this.setExpanded(false);
    }

    private setExpanded(isExpanded: boolean) {
        this.isExpanded = isExpanded;
        // Persisted but not pushed: disclosure changes nothing the engine paints.
        this.persist();
    }

    private onChanged(label: string) {
        this.persist();
        this.push();
        logEvent(LogCategories.ChartControl, LogActions.ChartType, label);
    }

    private push() {
        this.mainStore.chartAdapter.updateAreaStyle(this.payload);
    }

    private restore() {
        let stored: TPersistedAreaStyle | undefined;
        try {
            stored = createObjectFromLocalStorage(STORAGE_KEY);
        } catch {
            // `localStorage` itself can throw - Safari's private mode, a disabled
            // storage policy - which the helper does not guard against.
        }
        if (!stored) return;

        const { fill, colorId, thicknessId, isExpanded } = stored;

        // Each value is validated on its own: a palette entry removed in a later release
        // must fall back to the default rather than reach the engine as an unknown id,
        // and one stale field should not discard the other three.
        if (AREA_FILLS.some(f => f.id === fill)) this.fill = fill as TAreaFill;
        if (AREA_COLORS.some(c => c.id === colorId)) this.colorId = colorId as TAreaColorId;
        if (AREA_THICKNESSES.some(t => t.id === thicknessId)) this.thicknessId = thicknessId as TAreaThicknessId;
        if (typeof isExpanded === 'boolean') this.isExpanded = isExpanded;
    }

    private persist() {
        const value: TPersistedAreaStyle = {
            fill: this.fill,
            colorId: this.colorId,
            thicknessId: this.thicknessId,
            isExpanded: this.isExpanded,
        };
        try {
            saveToLocalStorage(STORAGE_KEY, value);
        } catch {
            // Not worth surfacing: the choice still applies to the live chart, it just
            // will not survive a reload.
        }
    }
}
