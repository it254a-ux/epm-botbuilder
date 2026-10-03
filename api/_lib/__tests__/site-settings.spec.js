const {
    sanitizeName, sanitizeColor, sanitizeFont, sanitizeLogoUrl, sanitizeWhatsapp,
    sanitizePhone, sanitizeEmail, sanitizeTelegram, toPublicSite,
    normalizeHost, parsePlatformHosts, decide,
} = require('../site-settings');

describe('sanitizers', () => {
    it('accepts valid values and rejects bad ones', () => {
        expect(sanitizeName('  Alice Trading ')).toBe('Alice Trading');
        expect(sanitizeName('<script>x</script>')).toBe('scriptx/script');
        expect(sanitizeName('A')).toBe('');
        expect(sanitizeColor('#20B7DC')).toBe('#20b7dc');
        expect(sanitizeColor('red')).toBe('');
        expect(sanitizeColor('#fff')).toBe('');
        expect(sanitizeFont('Poppins')).toBe('Poppins');
        expect(sanitizeFont('Comic Sans')).toBe('');
        expect(sanitizeLogoUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
        expect(sanitizeLogoUrl('http://cdn.example.com/a.png')).toBe('');
        expect(sanitizeLogoUrl('javascript:alert(1)')).toBe('');
    });

    it('normalises contacts', () => {
        expect(sanitizeWhatsapp('+254 705 491 022')).toBe('254705491022');
        expect(sanitizeWhatsapp('12')).toBe('');
        expect(sanitizePhone('+254 705-491-022')).toBe('+254705491022');
        expect(sanitizePhone('abc')).toBe('');
        expect(sanitizeEmail('Help@Alice.com')).toBe('help@alice.com');
        expect(sanitizeEmail('not an email')).toBe('');
        expect(sanitizeTelegram('@alice_support')).toBe('alice_support');
        expect(sanitizeTelegram('https://t.me/alice_support')).toBe('alice_support');
        expect(sanitizeTelegram('a b')).toBe('');
    });
});

describe('toPublicSite', () => {
    it('blank contacts stay blank and never expose extra columns', () => {
        const site = toPublicSite({ name: 'Alice', whatsapp: '', phone: null, support_email: undefined, telegram: '', status: 'active', domain: 'x.com' });
        expect(site.contacts).toEqual({ whatsapp: '', phone: '', email: '', telegram: '' });
        expect(site.domain).toBeUndefined();
        expect(site.status).toBeUndefined();
    });
});

describe('host handling', () => {
    it('normalises hosts', () => {
        expect(normalizeHost('Trade.Alice.com:443')).toBe('trade.alice.com');
        expect(normalizeHost('a.com, b.com')).toBe('a.com');
        expect(parsePlatformHosts('Exec.site, www.exec.site ,')).toEqual(['exec.site', 'www.exec.site']);
        expect(parsePlatformHosts(undefined)).toEqual([]);
    });
});

describe('decide', () => {
    const row = { name: 'Alice', status: 'active', whatsapp: '254700000000' };
    it('operator row wins', () => {
        const d = decide({ host: 'trade.alice.com', row, platformHosts: ['exec.site'] });
        expect(d.kind).toBe('site');
        expect(d.site.contacts.whatsapp).toBe('254700000000');
    });
    it('suspended row is unconfigured, never the platform', () => {
        expect(decide({ host: 'a.com', row: { ...row, status: 'suspended' }, platformHosts: [] }))
            .toEqual({ kind: 'unconfigured', reason: 'suspended' });
    });
    it('legacy mode (PLATFORM_HOSTS unset) keeps today\'s behaviour', () => {
        expect(decide({ host: 'anything.com', row: null, platformHosts: [] })).toEqual({ kind: 'platform' });
    });
    it('strict mode: own domain is platform, unknown domain is unconfigured', () => {
        expect(decide({ host: 'exec.site', row: null, platformHosts: ['exec.site'] })).toEqual({ kind: 'platform' });
        expect(decide({ host: 'localhost', row: null, platformHosts: ['exec.site'] })).toEqual({ kind: 'platform' });
        expect(decide({ host: 'evil.com', row: null, platformHosts: ['exec.site'] }))
            .toEqual({ kind: 'unconfigured', reason: 'unknown_domain' });
    });
});
