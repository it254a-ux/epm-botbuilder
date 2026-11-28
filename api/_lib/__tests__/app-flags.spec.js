/** @jest-environment node */
// The admin on/off switch for the forced "Real account" label: ON until the admin turns it off.
const { getFlag, setFlag } = require('../app-flags');

const fakeSql = () => {
    const store = new Map();
    const sql = (strings, ...vals) => {
        const q = strings.join('?');
        if (/^\s*CREATE TABLE/i.test(q)) return Promise.resolve([]);
        if (/^\s*SELECT/i.test(q)) return Promise.resolve(store.has(vals[0]) ? [{ on_state: store.get(vals[0]) }] : []);
        if (/^\s*INSERT/i.test(q)) {
            store.set(vals[0], vals[1]);
            return Promise.resolve([]);
        }
        return Promise.resolve([]);
    };
    return sql;
};

describe('forced_real switch', () => {
    test('is ON when never set (keeps today\'s behaviour)', async () => {
        expect(await getFlag(fakeSql(), 'forced_real')).toBe(true);
    });
    test('can be turned OFF and ON again', async () => {
        const sql = fakeSql();
        await setFlag(sql, 'forced_real', false);
        expect(await getFlag(sql, 'forced_real')).toBe(false);
        await setFlag(sql, 'forced_real', true);
        expect(await getFlag(sql, 'forced_real')).toBe(true);
    });
    test('unknown switches are refused', async () => {
        await expect(setFlag(fakeSql(), 'something_else', true)).rejects.toThrow();
        expect(await getFlag(fakeSql(), 'something_else')).toBeNull();
    });
});

describe('forced Real Account list', () => {
    const { getAccounts, setAccounts, cleanAccounts } = require('../app-flags');
    const sqlWith = value => {
        let stored = value;
        const sql = (strings, ...vals) => {
            const q = strings.join('?');
            if (/^\s*CREATE TABLE/i.test(q)) return Promise.resolve([]);
            if (/^\s*SELECT/i.test(q)) return Promise.resolve(stored === undefined ? [] : [{ value: stored }]);
            if (/^\s*INSERT/i.test(q)) {
                stored = vals[0];
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        };
        return sql;
    };
    test('starts with the one account used so far', async () => {
        expect(await getAccounts(sqlWith(undefined))).toEqual(['DOT94283012']);
    });
    test('can add, change and remove accounts', async () => {
        const sql = sqlWith(undefined);
        await setAccounts(sql, ['dot94283012', 'CR1234567']);
        expect(await getAccounts(sql)).toEqual(['DOT94283012', 'CR1234567']);
        await setAccounts(sql, []);
        expect(await getAccounts(sql)).toEqual([]);
    });
    test('drops wrong-looking IDs and duplicates', () => {
        expect(cleanAccounts(['CR1', 'bad id', 'CR1234567', 'cr1234567', ''])).toEqual(['CR1234567']);
    });
});
