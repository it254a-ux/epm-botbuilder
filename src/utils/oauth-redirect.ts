// Deriv sign-in on FREE operator sites (name.<your domain>).
//
// Deriv only sends people back to redirect addresses registered on your app, and you can't
// register one per operator. So on a free site we ask Deriv to return to YOUR main address
// (already registered -- your live login uses it), carrying the free site's host in `state`.
// Your main site then checks that host is an active free site and passes the sign-in code
// straight back to it. The browser on the free site finishes the login itself, because only
// it holds the PKCE code verifier and CSRF token (kept in that origin's sessionStorage).
//
// Platform and custom-domain sites are NOT affected: they keep using their own origin.
import { getActiveSite } from './site-settings';

const PREFIX = 'epm1';

const toB64Url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s: string) => {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
};

/** Your canonical main origin: the FIRST host in NEXT_PUBLIC_PLATFORM_HOSTS that is not www. */
export const getPlatformOrigin = (): string => {
    const hosts = (process.env.NEXT_PUBLIC_PLATFORM_HOSTS || '')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);
    const host = hosts.find(h => !h.startsWith('www.')) || hosts[0];
    return host ? `https://${host}` : '';
};

export const usesLoginBounce = (): boolean => getActiveSite()?.plan === 'free' && !!getPlatformOrigin();

/** The redirect_uri to give Deriv (used for BOTH the login URL and the token exchange). */
export const getOAuthRedirectUri = (): string => (usesLoginBounce() ? getPlatformOrigin() : window.location.origin);

/** Adds "where to return to" to the login URL's state, on free sites only. */
export const decorateAuthUrl = (url: string): string => {
    if (!url || !usesLoginBounce()) return url;
    const u = new URL(url);
    const csrf = u.searchParams.get('state');
    if (!csrf) return url;
    u.searchParams.set('state', `${PREFIX}.${csrf}.${toB64Url(window.location.host)}`);
    return u.toString();
};

export const parseReturnState = (state: string | null): { csrf: string; host: string } | null => {
    if (!state) return null;
    const parts = state.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    try {
        const host = fromB64Url(parts[2]).toLowerCase();
        return /^[a-z0-9.-]{4,253}$/.test(host) ? { csrf: parts[1], host } : null;
    } catch {
        return null;
    }
};

/**
 * Runs on YOUR main domain. If this page load is a sign-in coming back for a free site,
 * verify the site with the server and forward the code. Returns true when it is redirecting.
 */
export const bounceToFreeSite = async (): Promise<boolean> => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    const returned = parseReturnState(q.get('state'));
    if (!code || !returned) return false;

    try {
        const res = await fetch(`/api/return-host?host=${encodeURIComponent(returned.host)}`, { credentials: 'omit' });
        const data = await res.json();
        if (data && data.ok === true) {
            const next = new URL(`https://${returned.host}/`);
            next.searchParams.set('code', code);
            next.searchParams.set('state', returned.csrf);
            const scope = q.get('scope');
            if (scope) next.searchParams.set('scope', scope);
            window.location.replace(next.toString());
            return true;
        }
    } catch {
        /* fall through to the error page */
    }
    return true; // it WAS a bounce request, so never let the main app try to complete it
};
