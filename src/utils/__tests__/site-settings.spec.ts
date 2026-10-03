import { getHelpOptions } from '@/components/get-help';
import { getAppName } from '../branding';
import {
    getSiteContacts,
    PLATFORM_CONTACTS,
    setSiteSettings,
    telegramHref,
    whatsappHref,
} from '../site-settings';

const operator = (
    contacts: Partial<ReturnType<typeof getSiteContacts>> = {},
    plan: 'free' | 'custom' = 'custom'
) =>
    setSiteSettings({
        kind: 'site',
        site: {
            plan,
            powered_by: plan === 'free',
            about: '',
            vision: '',
            mission: '',
            name: 'Alice Trading',
            primary_color: '#112233',
            font: 'Poppins',
            logo_url: '',
            contacts: { whatsapp: '', phone: '', email: '', telegram: '', ...contacts },
        },
    });

afterEach(() => setSiteSettings({ kind: 'platform' }));

describe('site settings', () => {
    it('platform keeps today\'s name-independent defaults and contacts', () => {
        setSiteSettings({ kind: 'platform' });
        expect(getSiteContacts()).toEqual(PLATFORM_CONTACTS);
        expect(getHelpOptions().map(o => o.key)).toEqual(['whatsapp', 'message', 'phone']);
    });

    it('operator site uses its own name', () => {
        operator();
        expect(getAppName()).toBe('Alice Trading');
    });

    it('operator with no contacts shows no buttons and never the platform number', () => {
        operator();
        expect(getHelpOptions()).toEqual([]);
        expect(JSON.stringify(getHelpOptions())).not.toContain(PLATFORM_CONTACTS.whatsapp);
    });

    it('operator contacts become the right buttons', () => {
        operator({ whatsapp: '254700000001', telegram: 'alice_help' });
        const opts = getHelpOptions();
        expect(opts.map(o => o.key)).toEqual(['whatsapp', 'telegram']);
        expect(opts[0].href).toContain('https://wa.me/254700000001');
        expect(opts[1].href).toBe('https://t.me/alice_help');
    });

    it('free sites send clients to the platform, never to operator-entered contacts', () => {
        operator({ whatsapp: '254700000001' }, 'free');
        expect(getSiteContacts()).toEqual(PLATFORM_CONTACTS);
        expect(getAppName()).toBe('Alice Trading');
    });

    it('refuses to build links from unchecked strings', () => {
        expect(whatsappHref('javascript:alert(1)')).toBe('');
        expect(telegramHref('x y')).toBe('');
    });
});
