// Shared helpers for per-domain site settings (CommonJS, like the other api/ files).
// Everything an operator can customise is validated here, so the public endpoint
// never hands the browser an unchecked string.

// Keep in sync with SUPPORTED_FONTS in src/utils/load-web-font.ts.
const SUPPORTED_FONTS = [
    'Inter', 'Roboto', 'Poppins', 'DM Sans', 'Lato',
    'Nunito', 'Open Sans', 'Montserrat', 'Raleway', 'Source Sans 3',
];

const clean = v => (typeof v === 'string' ? v.trim() : '');

function sanitizeName(v) {
    const s = clean(v).replace(/[<>]/g, '');
    return s.length >= 2 && s.length <= 60 ? s : '';
}

function sanitizeColor(v) {
    const s = clean(v);
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '';
}

function sanitizeFont(v) {
    const s = clean(v);
    return SUPPORTED_FONTS.includes(s) ? s : '';
}

function sanitizeLogoUrl(v) {
    const s = clean(v);
    if (!s || s.length > 500) return '';
    try {
        const u = new URL(s);
        return u.protocol === 'https:' ? u.toString() : '';
    } catch {
        return '';
    }
}

// WhatsApp: digits only with country code (7-15 digits). Accepts "+254 7xx xxx xxx".
function sanitizeWhatsapp(v) {
    const digits = clean(v).replace(/[^0-9]/g, '');
    return /^[0-9]{7,15}$/.test(digits) ? digits : '';
}

// Phone: keeps a leading + and digits only.
function sanitizePhone(v) {
    const s = clean(v);
    const digits = s.replace(/[^0-9]/g, '');
    if (!/^[0-9]{6,15}$/.test(digits)) return '';
    return (s.startsWith('+') ? '+' : '') + digits;
}

function sanitizeEmail(v) {
    const s = clean(v).toLowerCase();
    return s.length <= 120 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(s) ? s : '';
}

// Telegram: username only. Accepts "@name" or "https://t.me/name".
function sanitizeTelegram(v) {
    const s = clean(v).replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
    return /^[A-Za-z0-9_]{5,32}$/.test(s) ? s : '';
}

// Turns a DB row (or admin input) into the public shape. Blank/invalid contact
// fields become '' so the client hides them -- they NEVER fall back to the
// platform's own contact details.
function toPublicSite(row) {
    return {
        name: sanitizeName(row.name),
        primary_color: sanitizeColor(row.primary_color),
        font: sanitizeFont(row.font),
        logo_url: sanitizeLogoUrl(row.logo_url),
        contacts: {
            whatsapp: sanitizeWhatsapp(row.whatsapp),
            phone: sanitizePhone(row.phone),
            email: sanitizeEmail(row.support_email),
            telegram: sanitizeTelegram(row.telegram),
        },
    };
}

// "Trade.Alice.com:443" -> "trade.alice.com"
function normalizeHost(raw) {
    const first = clean(String(raw || '').split(',')[0]).toLowerCase();
    return first.replace(/:\d+$/, '').replace(/\.$/, '');
}

function parsePlatformHosts(env) {
    return clean(env || '')
        .split(',')
        .map(normalizeHost)
        .filter(Boolean);
}

const isLocalHost = host => host === 'localhost' || host === '127.0.0.1';

// Decides what a host should see.
//  - row found and active  -> that site
//  - host is a platform host (or PLATFORM_HOSTS is unset, i.e. today's behaviour)
//                          -> 'platform' (the build-time EPM defaults)
//  - anything else         -> 'unconfigured' (never shows the platform's branding/contacts)
function decide({ host, row, platformHosts }) {
    if (row && row.status === 'active') return { kind: 'site', site: toPublicSite(row) };
    if (row) return { kind: 'unconfigured', reason: 'suspended' };
    if (platformHosts.length === 0) return { kind: 'platform' };
    if (platformHosts.includes(host) || isLocalHost(host)) return { kind: 'platform' };
    return { kind: 'unconfigured', reason: 'unknown_domain' };
}

module.exports = {
    SUPPORTED_FONTS,
    sanitizeName, sanitizeColor, sanitizeFont, sanitizeLogoUrl,
    sanitizeWhatsapp, sanitizePhone, sanitizeEmail, sanitizeTelegram,
    toPublicSite, normalizeHost, parsePlatformHosts, decide, isLocalHost,
};
