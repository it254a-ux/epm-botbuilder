import { action, observable, reaction, makeObservable } from 'mobx';
import MainStore from '.';

export default class ToolbarWidgetStore {
    mainStore: MainStore;
    isExpanded = false; // Mobile: whether the vertical-ellipsis menu is expanded
    get crosshairStore() {
        return this.mainStore.crosshair;
    }
    get chartStore() {
        return this.mainStore.chart;
    }

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            isExpanded: observable,
            toggleExpanded: action.bound,
            collapse: action.bound,
            onMouseEnter: action.bound,
            onMouseLeave: action.bound,
        });

        this.mainStore = mainStore;

        reaction(
            () => [
                this.mainStore.chartMode.menuStore.open,
                this.mainStore.drawTools.menuStore.open,
                this.mainStore.studies.menuStore.open,
                this.mainStore.share.menuStore.open,
                this.mainStore.view.menuStore.open,
            ],
            () => {
                // Check if all floating toolbar component dialog close
                if (
                    !this.mainStore.chartMode.menuStore.open &&
                    !this.mainStore.drawTools.menuStore.open &&
                    !this.mainStore.studies.menuStore.open &&
                    !this.mainStore.share.menuStore.open &&
                    !this.mainStore.view.menuStore.open
                ) {
                    this.onMouseLeave();
                    // Collapse the mobile ellipsis menu once every dialog is closed
                    this.collapse();
                }
            }
        );
    }

    toggleExpanded() {
        this.isExpanded = !this.isExpanded;
    }

    collapse() {
        this.isExpanded = false;
    }

    onMouseEnter() {
        this.crosshairStore.setTemporaryDisabled(true);
    }

    onMouseLeave() {
        this.crosshairStore.setTemporaryDisabled(false);
    }
}
