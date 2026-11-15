import { expect } from 'chai';
import { str as crc32 } from 'crc-32';
import { autorun } from 'mobx';
import { DEFAULT_TRANSLATIONS_CDN_URL, getLanguage, localize, setLanguage, setTranslationsCdnUrl } from '..';

const storage = new Map<string, string>();
const requests: string[] = [];
const catalogues: Record<string, Record<string, string>> = {
    de: {
        [crc32('Area').toString()]: 'Fläche',
        [crc32('Trend line {{num}}').toString()]: 'Trendlinie {{num}}',
    },
};

// The bits of a browser `@deriv-com/translations` touches. It only reads them once the
// first language is set, so defining them after the imports is early enough.
Object.assign(globalThis, {
    window: { location: { search: '' } },
    localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
    fetch: (url: string) => {
        requests.push(url);
        const body = catalogues[url.replace(/^.*\/translations\/(\w+)\.json$/, '$1')];
        return Promise.resolve({ ok: !!body, json: () => Promise.resolve(body) });
    },
});

const switchTo = (lang: string) => new Promise<void>(resolve => setLanguage(lang, resolve));

describe('translations', () => {
    it('returns the English source, interpolated, before any language is loaded', () => {
        expect(localize('Area')).to.equal('Area');
        expect(localize('{{a}} and {{a}}', { a: 'x' })).to.equal('x and x');
    });

    it('loads the catalogue from <cdnUrl>/translations/<lang>.json and looks strings up by crc32', async () => {
        setTranslationsCdnUrl('https://cdn.test/deriv-smartcharts/staging/');
        await switchTo('de');

        expect(requests).to.include('https://cdn.test/deriv-smartcharts/staging/translations/de.json');
        expect(getLanguage()).to.equal('de');
        expect(localize('Area')).to.equal('Fläche');
        expect(localize('Trend line {{num}}', { num: 2 })).to.equal('Trendlinie 2');
    });

    it('falls back to the string itself when it is not in the catalogue', () => {
        expect(localize('Candle')).to.equal('Candle');
        // A label already translated where it was defined, translated again where it renders.
        expect(localize(localize('Trend line {{num}}'), { num: 3 })).to.equal('Trendlinie 3');
    });

    it('maps zh_cn to the zh_cn.json catalogue', async () => {
        await switchTo('zh_cn');
        expect(requests[requests.length - 1]).to.match(/\/translations\/zh_cn\.json$/);
    });

    it('still calls back, and shows English, when a catalogue cannot be loaded', async () => {
        await switchTo('fr');
        expect(getLanguage()).to.equal('fr');
        expect(localize('Area')).to.equal('Area');
    });

    it('re-runs observers when the language changes', async () => {
        const seen: string[] = [];
        const dispose = autorun(() => seen.push(localize('Area')));
        await switchTo('de');
        dispose();
        expect(seen[0]).to.equal('Area');
        expect(seen[seen.length - 1]).to.equal('Fläche');
    });

    it('does not HTML-escape interpolated values', () => {
        // React escapes text itself; i18next escaping would show `&#x2F;` in `EUR/USD`.
        expect(localize('Trend line {{num}}', { num: `EUR/USD & "x" O'Neil <b>` })).to.equal(
            `Trendlinie EUR/USD & "x" O'Neil <b>`
        );
    });

    it('reads from a new CDN folder when translationsCdnUrl changes after a language is loaded', async () => {
        // Relies on the package backend's `cdnUrl` field; this flags an upgrade that renames it.
        const before = requests.length;
        setTranslationsCdnUrl('https://cdn.test/deriv-smartcharts/production');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(requests.slice(before)).to.include('https://cdn.test/deriv-smartcharts/production/translations/de.json');
        expect(localize('Area')).to.equal('Fläche');
    });

    it('never writes the host-owned localStorage language', () => {
        expect(storage.get('i18n_language')).to.not.equal('"DE"');
        expect(storage.get('i18n_language')).to.not.equal('"FR"');
    });

    it('defaults to the production folder', () => {
        expect(DEFAULT_TRANSLATIONS_CDN_URL).to.equal('https://translations.deriv.com/deriv-smartcharts/production');
    });
});
