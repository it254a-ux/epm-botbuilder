import { action, computed, observable, makeObservable } from 'mobx';
import MainStore from '.';
import ChartStore from './ChartStore';

export default class NavigationWidgetStore {
    mainStore: MainStore;
    mouse_in = false;
    get chart(): ChartStore {
        return this.mainStore.chart;
    }
    get stateStore() {
        return this.mainStore.state;
    }
    get crosshairStore() {
        return this.mainStore.crosshair;
    }

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            mouse_in: observable,
            enableScale: computed,
            onMouseEnter: action.bound,
            onMouseLeave: action.bound,
        });

        this.mainStore = mainStore;
    }

    get enableScale() {
        return this.stateStore.startEpoch;
    }

    onMouseEnter() {
        this.mouse_in = true;
        this.crosshairStore.setTemporaryDisabled(true);
    }

    onMouseLeave() {
        this.mouse_in = false;
        this.crosshairStore.setTemporaryDisabled(false);
    }
}
