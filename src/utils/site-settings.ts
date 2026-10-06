// Per-domain site settings (name, colour, font, logo, support contacts).
//
// One deployment serves many sites. On startup we ask /api/site-settings which
// site the current domain belongs to:
//   platform      -> your own site: keep the build-time EPM branding and contacts
//   site          -> an operator's site: use THEIR branding and THEIR contacts only
//   unconfigured  -> unknown / suspended domain: show a "not set up" page
//
// Safety rule: an operator site never falls back to the platform's contact
// details. A contact the operator left blank is simply not shown.

export type TSiteContacts = {
    whatsapp: string;
    phone: string;
    email: string;
    telegram: string;
};

export type TSite = {
    plan: 'free' | 'custom';
    /** Free sites show a small "Powered by" note and route support to the platform. */
    powered_by: boolean;
    about: string;
    vision: string;
    mission: string;
    name: string;
    primary_color: string;
    font: string;
    logo_url: string;
    contacts: TSiteContacts;
};

export type TSiteSettings =
    | { kind: 'platform' }
    | { kind: 'site'; site: TSite }
    | { kind: 'unconfigured'; reason?: string }
    | { kind: 'error' };

// Your own (platform) support details -- exactly what the app shows today.
export const PLATFORM_CONTACTS: TSiteContacts = {
    whatsapp: '254115533208',
    phone: '+254115533208',
    email: 'support@executiveprimemarkets.site',
    telegram: '',
};

const PLATFORM_DEFAULT: TSiteSettings = { kind: 'platform' };
let current: TSiteSettings = PLATFORM_DEFAULT;

export const getSiteSettings = (): TSiteSettings => current;
export const setSiteSettings = (settings: TSiteSettings): void => {
    current = settings;
};

/** The operator's site when running on an operator domain, else null. */
export const getActiveSite = (): TSite | null => (current.kind === 'site' ? current.site : null);

/**
 * Contacts to show:
 *  - platform and FREE sites: yours (free-site clients talk to the platform)
 *  - CUSTOM-domain sites: only what the operator filled in; blank means hidden
 */
export const getSiteContacts = (): TSiteContacts =>
    current.kind === 'site' && current.site.plan === 'custom' ? current.site.contacts : PLATFORM_CONTACTS;

// Defensive re-validation: even though the API sanitizes, never build a link
// from a string we haven't checked.
const WHATSAPP_RE = /^[0-9]{7,15}$/;
const PHONE_RE = /^\+?[0-9]{6,15}$/;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const TELEGRAM_RE = /^[A-Za-z0-9_]{5,32}$/;

export const whatsappHref = (n: string, text?: string) =>
    WHATSAPP_RE.test(n) ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '';
export const phoneHref = (n: string) => (PHONE_RE.test(n) ? `tel:${n}` : '');
export const smsHref = (n: string) => (PHONE_RE.test(n) ? `sms:${n}` : '');
export const emailHref = (e: string) => (EMAIL_RE.test(e) ? `mailto:${e}` : '');
export const telegramHref = (u: string) => (TELEGRAM_RE.test(u) ? `https://t.me/${u}` : '');

// Hosts that are allowed to fall back to platform branding if the API is down.
const platformHosts = (process.env.NEXT_PUBLIC_PLATFORM_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

const isPlatformHostHere = (): boolean => {
    const host = window.location.hostname.toLowerCase();
    return (
        platformHosts.length === 0 ||
        platformHosts.includes(host) ||
        host === 'localhost' ||
        host === '127.0.0.1'
    );
};

const FETCH_TIMEOUT_MS = 3000;

// Site settings rarely change mid-session, but the app mounts nothing at all
// (not even its own loading spinner -- see src/main.tsx) until this lookup
// resolves, so previously every refresh paid a full network round trip
// before the page could even start rendering. sessionStorage makes every
// refresh after the first one in a tab resolve instantly instead, without
// changing what gets fetched or how the result is used -- a fresh browser
// session (new tab) still asks the server, exactly as before. Only a
// successful 'platform' or 'site' result is cached; 'unconfigured'/'error'
// are left uncached so a transient failure doesn't stick for the rest of
// the session.
const SESSION_CACHE_KEY = 'epm_site_settings_cache_v1';

const readSessionCache = (): TSiteSettings | null => {
    try {
        const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as TSiteSettings;
        if (parsed && (parsed.kind === 'platform' || parsed.kind === 'site')) return parsed;
        return null;
    } catch {
        return null;
    }
};

const writeSessionCache = (settings: TSiteSettings) => {
    try {
        window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(settings));
    } catch {
        // Storage unavailable/full/private mode -- fine, just means no caching this session.
    }
};

/**
 * Loads the settings for this domain. Never throws. If the lookup fails we only
 * fall back to the platform's branding on your own domains; on anyone else's
 * domain we show the "temporarily unavailable" page instead of your branding.
 */
export const loadSiteSettings = async (): Promise<TSiteSettings> => {
    const cached = readSessionCache();
    if (cached) {
        current = cached;
        return cached;
    }
    try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch('/api/site-settings', { signal: controller.signal, credentials: 'omit' });
        window.clearTimeout(timer);
        if (!res.ok) throw new Error(`site-settings ${res.status}`);
        const data = (await res.json()) as TSiteSettings;
        if (data && (data.kind === 'platform' || data.kind === 'site' || data.kind === 'unconfigured')) {
            current = data;
            if (data.kind === 'platform' || data.kind === 'site') writeSessionCache(data);
            return data;
        }
        throw new Error('bad site-settings payload');
    } catch {
        current = isPlatformHostHere() ? PLATFORM_DEFAULT : { kind: 'error' };
        return current;
    }
};
