import { initializeI18n, localize as derivLocalize } from '@deriv-com/translations';
import type { i18n as TI18n } from 'i18next';
import { action, makeObservable, observable } from 'mobx';

/**
 * SmartCharts' translations, on `@deriv-com/translations` - the same catalogue format
 * (crc32 of the English text -> translation, `{{var}}` placeholders) and the same CDN
 * layout every other Deriv front end uses, so the shared Rosetta sync action keeps
 * `<cdnUrl>/translations/<lang>.json` up to date.
 *
 * The library bundles its own copy of `@deriv-com/translations` and i18next (they are
 * deliberately not webpack externals): `initializeI18n` configures the default i18next
 * singleton of whichever copy it resolves to, so sharing the host's copy would replace
 * the host's catalogue with ours. Bundled, SmartCharts has an instance of its own and
 * reads its own strings from its own CDN folder.
 */
export const DEFAULT_TRANSLATIONS_CDN_URL = 'https://translations.deriv.com/deriv-smartcharts/production';

type TValues = Record<string, unknown>;
type TBackend = { cdnUrl: string };

class TranslationState {
    /** The lower-case key of the language whose catalogue is loaded, e.g. `en`, `zh_cn`. */
    lang = 'en';
    /**
     * Bumped whenever i18next initialises, switches language or loads a catalogue.
     * `localize` reads it, so every `observer` that renders a translated string re-renders
     * when that happens - i18next itself is not observable, and the package's own
     * `localize` is documented as not refreshing on a language change.
     */
    revision = 0;

    constructor() {
        makeObservable(this, {
            lang: observable,
            revision: observable,
            onI18nChange: action,
        });
    }

    onI18nChange = () => {
        this.lang = (i18n?.language || 'en').toLowerCase();
        this.revision += 1;
    };
}

const state = new TranslationState();
let cdnUrl = DEFAULT_TRANSLATIONS_CDN_URL;
/**
 * The instance `initializeI18n` configured - always used through this reference, never
 * through an `i18next` import of our own, which could resolve to a different copy of
 * i18next than the one the package's `localize` reads.
 */
let i18n: TI18n | null = null;

const interpolate = (text: string, values?: TValues) =>
    values
        ? text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => (name in values ? String(values[name]) : match))
        : text;

const ensureInitialized = (): TI18n => {
    if (i18n) return i18n;
    // `useSuspense: false`: the chart renders English until a catalogue arrives instead of
    // suspending, and the host need not wrap SmartCharts in a Suspense boundary.
    i18n = initializeI18n({ cdnUrl, useSuspense: false });
    i18n.on('initialized', state.onI18nChange);
    i18n.on('languageChanged', state.onI18nChange);
    i18n.on('loaded', state.onI18nChange);
    return i18n;
};

/**
 * Where the catalogues are read from: `<cdnUrl>/translations/<lang>.json`. The host passes
 * `https://translations.deriv.com/deriv-smartcharts/<staging|production>` through the
 * `translationsCdnUrl` prop, the same way it builds the `cdnUrl` of its own `initializeI18n`.
 */
export const setTranslationsCdnUrl = (url?: string) => {
    const next = (url || DEFAULT_TRANSLATIONS_CDN_URL).replace(/\/+$/, '');
    if (next === cdnUrl) return;
    cdnUrl = next;
    if (!i18n) return;
    const backend = i18n.services?.backendConnector?.backend as TBackend | undefined;
    if (backend) backend.cdnUrl = cdnUrl;
    i18n.reloadResources();
};

/**
 * Switches SmartCharts to `lang` (a key of `Languages`, e.g. `en`, `zh_cn`) and calls
 * `callback` once its catalogue has settled - on failure too, as the callback is the
 * caller's "locale settled" signal that hides the loader.
 *
 * Deliberately i18next's `changeLanguage` and not the package's `switchLanguage`: that one
 * also writes `localStorage.i18n_language`, which belongs to the host app.
 */
export const setLanguage = (lang: string, callback?: () => void) => {
    ensureInitialized()
        .changeLanguage(lang.toUpperCase())
        .catch((error: unknown) => {
            console.error('Failed to load language:', lang, error);
        })
        .then(() => {
            state.onI18nChange();
            callback?.();
        });
};

/** The lower-case key of the active language; observable. */
export const getLanguage = () => state.lang;

/**
 * Translates `text` (the English source) with `{{name}}` placeholders filled from `values`.
 *
 * Pass a string literal wherever the string is first written: the shared extractor only
 * collects literal arguments of `localize(`. A label stored in a constant is marked with a
 * literal where it is defined and translated again where it is rendered, so it follows a
 * language change; an already-translated or unknown string falls back to itself.
 */
export const localize = (text: string, values?: TValues): string => {
    // Read for its side effect: it subscribes the calling observer to language changes.
    // eslint-disable-next-line no-unused-expressions
    state.revision;
    // Labels in module-level constants are marked before i18next is initialised, when it
    // has no translator yet and would return undefined; they stay English until rendered.
    if (!i18n) return interpolate(text, values);
    return derivLocalize(text, values);
};
