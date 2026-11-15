/**
 * Lightweight replacements for lodash functions to reduce bundle size.
 * These implementations cover the specific use cases in deriv-smartcharts.
 */

type DebounceOptions = {
    leading?: boolean;
    trailing?: boolean;
};

type DebouncedFunction<T extends (...args: any[]) => any> = {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
    flush: () => ReturnType<T> | undefined;
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - Options object with leading and trailing flags
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait = 0,
    options: DebounceOptions = {}
): DebouncedFunction<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: any = null;
    let result: ReturnType<T> | undefined;
    let lastCallTime: number | undefined;
    let lastInvokeTime = 0;

    const leading = options.leading ?? false;
    const trailing = options.trailing ?? true;

    const invokeFunc = (time: number): ReturnType<T> | undefined => {
        const args = lastArgs;
        const thisArg = lastThis;
        lastArgs = null;
        lastThis = null;
        lastInvokeTime = time;
        result = func.apply(thisArg, args as Parameters<T>);
        return result;
    };

    const startTimer = (pendingFunc: () => void, remainingWait: number): void => {
        timeoutId = setTimeout(pendingFunc, remainingWait);
    };

    const cancelTimer = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    const shouldInvoke = (time: number): boolean => {
        const timeSinceLastCall = lastCallTime === undefined ? wait : time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;

        return (
            lastCallTime === undefined ||
            timeSinceLastCall >= wait ||
            timeSinceLastCall < 0 ||
            timeSinceLastInvoke >= wait
        );
    };

    const trailingEdge = (time: number): ReturnType<T> | undefined => {
        timeoutId = null;
        if (trailing && lastArgs) {
            return invokeFunc(time);
        }
        lastArgs = null;
        lastThis = null;
        return result;
    };

    const timerExpired = (): void => {
        const time = Date.now();
        if (shouldInvoke(time)) {
            trailingEdge(time);
            return;
        }
        const timeSinceLastCall = lastCallTime === undefined ? 0 : time - lastCallTime;
        const remainingWait = wait - timeSinceLastCall;
        startTimer(timerExpired, remainingWait);
    };

    const leadingEdge = (time: number): ReturnType<T> | undefined => {
        lastInvokeTime = time;
        startTimer(timerExpired, wait);
        return leading ? invokeFunc(time) : result;
    };

    const debounced = function (this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
        const time = Date.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking) {
            if (timeoutId === null) {
                return leadingEdge(time);
            }
        } else if (timeoutId === null) {
            startTimer(timerExpired, wait);
        }
        return result;
    } as DebouncedFunction<T>;

    debounced.cancel = (): void => {
        cancelTimer();
        lastInvokeTime = 0;
        lastArgs = null;
        lastCallTime = undefined;
        lastThis = null;
    };

    debounced.flush = (): ReturnType<T> | undefined => {
        if (timeoutId === null) {
            return result;
        }
        return trailingEdge(Date.now());
    };

    return debounced;
}

/**
 * Sets the value at path of object. If a portion of path doesn't exist, it's created.
 *
 * @param object - The object to modify
 * @param path - The path of the property to set (e.g., 'a.b.c' or 'a[0].b')
 * @param value - The value to set
 * @returns The modified object
 */
export function set<T extends Record<string, any>>(object: T, path: string | string[], value: any): T {
    if (object == null) {
        return object;
    }

    const pathArray = Array.isArray(path) ? path : stringToPath(path);

    let current: any = object;
    const length = pathArray.length;
    const lastIndex = length - 1;

    for (let i = 0; i < length; i++) {
        const key = pathArray[i];

        if (i === lastIndex) {
            current[key] = value;
        } else {
            const nextValue = current[key];
            if (nextValue == null || typeof nextValue !== 'object') {
                // Create array if next key is numeric, otherwise object
                const nextKey = pathArray[i + 1];
                current[key] = isNumericKey(nextKey) ? [] : {};
            }
            current = current[key];
        }
    }

    return object;
}

/**
 * Converts a string path to an array of keys.
 * 
 * Handles:
 * - Dot notation: 'a.b.c' → ['a', 'b', 'c']
 * - Bracket notation: 'a[0].b' → ['a', '0', 'b']
 * - Quoted keys: 'a["b.c"].d' → ['a', 'b.c', 'd']
 * - Escaped quotes: 'a["b\\"c"]' → ['a', 'b"c']
 * 
 * @internal
 */
function stringToPath(path: string): string[] {
    const result: string[] = [];

    // Handle bracket notation: 'a[0].b' -> ['a', '0', 'b']
    // Handle dot notation: 'a.b.c' -> ['a', 'b', 'c']
    const rePropName = /[^.[\]]+|\[(?:([^"'][^[]*)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

    path.replace(rePropName, (match, expression, quote, subString) => {
        let key = match;
        if (quote) {
            key = subString.replace(/\\(\\)?/g, '$1');
        } else if (expression) {
            key = expression.trim();
        }
        result.push(key);
        return '';
    });

    return result;
}

/**
 * Checks if a key looks like a numeric index
 */
function isNumericKey(key: string): boolean {
    return /^\d+$/.test(key);
}
