// `@deriv-com/translations` points its `types` at a file it does not ship, so declare the
// part SmartCharts uses (see src/translations).
declare module '@deriv-com/translations' {
    export function initializeI18n(config: {
        cdnUrl: string;
        useSuspense?: boolean;
        enableDebug?: boolean;
    }): import('i18next').i18n;
    export function localize(text: string, values?: Record<string, unknown>): string;
}

declare var __webpack_public_path__: string;

declare module '*.scss';
declare module '*.svg' {
    const content: React.SVGAttributes<SVGElement>;
    export default content;
}
declare module '*.webp' {
    /** Emitted as a separate file by webpack; the import is its resolved URL. */
    const url: string;
    export default url;
}

interface Window {
    isProductionWebsite?: boolean;
    _trackJs: {
        token: string;
        application: string;
    };
}

interface Navigator {
    msSaveBlob: (blob: Blob, name: string) => void;
    onLine: boolean;
}

interface Document {
    documentMode?: number;
}
