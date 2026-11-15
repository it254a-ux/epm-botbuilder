import { computed, makeObservable, observable, when } from 'mobx';
import MainStore from '.';
import { STATE } from '../Constant';

const CROSSHAIR_ENABLED_KEY = 'is_crosshair_enabled';

class CrosshairStore {
    mainStore: MainStore;
    isEnabled = true; // User-controlled crosshair state
    isTemporarilyDisabled = false; // Temporarily disabled (e.g., on hover)
    private shouldPersist = true; // Whether to persist state to localStorage

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            isEnabled: observable,
            isTemporarilyDisabled: observable,
            isFunctionallyActive: computed,
        });

        this.mainStore = mainStore;

        // Load crosshair enabled state from localStorage
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const savedCrosshairEnabled = localStorage.getItem(CROSSHAIR_ENABLED_KEY);
                if (savedCrosshairEnabled !== null) {
                    this.isEnabled = savedCrosshairEnabled === 'true';
                }
            }
        } catch {
            // Continue with default value
        }

        // Sync crosshair state with Flutter chart when it's loaded
        when(
            () => this.mainStore.chartAdapter.isChartLoaded,
            () => {
                this.mainStore.chartAdapter.flutterChart?.config.updateCrosshairVisibility(this.isFunctionallyActive);
            }
        );
    }

    get isFunctionallyActive(): boolean {
        return this.isEnabled && !this.isTemporarilyDisabled;
    }

    updateEnabledState = (enabled: boolean) => {
        this.isEnabled = enabled;
        this.mainStore.chartAdapter.flutterChart?.config.updateCrosshairVisibility(this.isFunctionallyActive);

        // Save to localStorage only if persistence is enabled
        try {
            if (this.shouldPersist && typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem(CROSSHAIR_ENABLED_KEY, enabled.toString());
            }
        } catch {
            // Silently fail - state is still updated in memory
        }

        // Track crosshair click event
        this.stateChange(STATE.CROSSHAIR_CLICK, {
            cta_name: enabled ? 'enable' : 'disable',
        });
    };

    setTemporaryDisabled = (disabled: boolean) => {
        this.isTemporarilyDisabled = disabled;
        this.mainStore.chartAdapter.flutterChart?.config.updateCrosshairVisibility(this.isFunctionallyActive);
    };

    // Set initial crosshair state without persisting to localStorage
    // Used by charts that need independent crosshair behavior (e.g., contract replay chart)
    // Also disables persistence for all future toggle actions on this chart instance
    setInitialEnabledState = (enabled: boolean) => {
        this.shouldPersist = false;
        this.isEnabled = enabled;
        this.mainStore.chartAdapter.flutterChart?.config.updateCrosshairVisibility(this.isFunctionallyActive);
    };

    // Helper method to track crosshair state changes
    stateChange = (event: string, params: Record<string, string> = {}) => {
        this.mainStore.state.stateChange(event, params);
    };
}
export default CrosshairStore;
