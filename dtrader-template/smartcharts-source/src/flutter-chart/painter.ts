type TPainterCallback = (currentTickPercent: number) => void;

export default class Painter {
    callbacks: TPainterCallback[] = [];

    // The lerped close value received directly from Flutter.
    // This is the exact same value Flutter uses to animate the line,
    // ensuring perfect synchronization for barrier animation.
    private _lerpedClose: number | null = null;

    // Getter for the lerped close value from Flutter
    get lerpedClose(): number | null {
        return this._lerpedClose;
    }

    onPaint = (currentTickPercent: number, lerpedQuote?: number | null) => {
        // Store the lerped quote value from Flutter.
        // This is computed by Flutter using the exact same logic as the line animation.
        this._lerpedClose = lerpedQuote ?? null;

        // All registered callbacks receive the same currentTickPercent.
        this.callbacks.forEach(cb => {
            cb(currentTickPercent);
        });
    };

    registerCallback = (callback: TPainterCallback) => {
        this.callbacks.push(callback);
    };

    unregisterCallback = (callback: TPainterCallback) => {
        const index = this.callbacks.findIndex(item => item === callback);
        if (index !== -1) {
            this.callbacks.splice(index, 1);
        }
    };
}
