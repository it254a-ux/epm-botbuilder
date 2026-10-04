import { decorateAuthUrl, getOAuthRedirectUri, parseReturnState, usesLoginBounce } from '../oauth-redirect';
import { setSiteSettings } from '../site-settings';

const site = (plan: 'free' | 'custom') =>
    setSiteSettings({
        kind: 'site',
        site: { plan, powered_by: plan === 'free', about: '', vision: '', mission: '', name: 'Elite', primary_color: '', font: '', logo_url: '', contacts: { whatsapp: '', phone: '', email: '', telegram: '' } },
    });

const AUTH = 'https://auth.deriv.com/oauth2/auth?client_id=1&redirect_uri=x&state=abc_DEF-123';

beforeEach(() => {
    process.env.NEXT_PUBLIC_PLATFORM_HOSTS = 'www.example.site,example.site';
});
afterEach(() => {
    setSiteSettings({ kind: 'platform' });
    delete process.env.NEXT_PUBLIC_PLATFORM_HOSTS;
});

describe('login bounce', () => {
    it('platform and custom-domain sites keep their own origin and an untouched state', () => {
        setSiteSettings({ kind: 'platform' });
        expect(usesLoginBounce()).toBe(false);
        expect(getOAuthRedirectUri()).toBe(window.location.origin);
        expect(decorateAuthUrl(AUTH)).toBe(AUTH);
        site('custom');
        expect(usesLoginBounce()).toBe(false);
        expect(getOAuthRedirectUri()).toBe(window.location.origin);
        expect(decorateAuthUrl(AUTH)).toBe(AUTH);
    });

    it('free sites return via the main origin and carry their host in state', () => {
        site('free');
        expect(getOAuthRedirectUri()).toBe('https://example.site');
        const state = new URL(decorateAuthUrl(AUTH)).searchParams.get('state')!;
        expect(state.startsWith('epm1.abc_DEF-123.')).toBe(true);
        expect(parseReturnState(state)).toEqual({ csrf: 'abc_DEF-123', host: window.location.host.toLowerCase() });
    });

    it('rejects malformed or foreign state values', () => {
        expect(parseReturnState(null)).toBeNull();
        expect(parseReturnState('plain-csrf-token')).toBeNull();
        expect(parseReturnState('epm1.abc')).toBeNull();
        expect(parseReturnState('other.abc.ZXZpbC5jb20')).toBeNull();
        expect(parseReturnState('epm1.a b.ZXZpbC5jb20')).toBeNull();
    });
});
