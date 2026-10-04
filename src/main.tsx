import { configure } from 'mobx';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
import SiteUnavailable from './app/SiteUnavailable';
import { bounceToFreeSite } from './utils/oauth-redirect';
import { loadSiteSettings } from './utils/site-settings';
// Removed AnalyticsInitializer import - analytics dependency removed
// See migrate-docs/ANALYTICS_IMPLEMENTATION_GUIDE.md for re-implementation
import {
    applyBrandFontFromConfig,
    applyDocumentTitle,
    applyFaviconFromLogo,
    applyPrimaryColorFromConfig,
} from './utils/document-branding';
import { getAccountId } from './utils/account-helpers';
import { performVersionCheck } from './utils/version-check';
import { clearStaleServiceWorkers } from './utils/clear-stale-service-workers';
import './styles/index.scss';

// Configure MobX to handle multiple instances in production builds
configure({ isolateGlobalState: true });

// Perform version check FIRST - before any other operations
performVersionCheck();

// Unregister any service worker left behind by an earlier deployment before
// anything else runs — see clear-stale-service-workers.ts for why this has
// to be unconditional and global rather than scoped to one page/component.
clearStaleServiceWorkers();

// Consume any incoming ?token=&acct= from the dashboard's iframe embed BEFORE
// anything else runs. getAccountId() is what actually stores the token as
// auth_info and the account id as active_loginid (see account-helpers.ts).
// This must happen before the app mounts: api_base picks an authenticated vs.
// public WebSocket URL once, the first time it connects, so auth_info has to
// already be in localStorage by then — not moments later once a component
// happens to call getAccountId() on its own.
getAccountId();

// Removed AnalyticsInitializer() call - analytics dependency removed

// App Builder preview branding (incl. PREVIEW_READY handshake) is handled by the
// src/preview/ listener, mounted from app-content only in the preview deployment
// (NEXT_PUBLIC_APP_BUILD === 'true') and stripped from standalone partner deploys.
//
// One deployment serves many sites, so first find out which site this domain is
// (see utils/site-settings.ts), THEN apply branding and mount. On your own domain
// nothing changes: the settings come back as "platform" and the build-time EPM
// branding is used exactly as before.
const root = ReactDOM.createRoot(document.getElementById('root')!);

loadSiteSettings().then(async settings => {
    if (settings.kind === 'unconfigured' || settings.kind === 'error') {
        document.title = settings.kind === 'error' ? 'Temporarily unavailable' : 'Site not set up';
        root.render(
            <SiteUnavailable
                kind={settings.kind}
                reason={settings.kind === 'unconfigured' ? settings.reason : undefined}
            />
        );
        return;
    }

    // A free operator site's Deriv sign-in comes back to YOUR main domain first; forward it on.
    if (settings.kind === 'platform' && (await bounceToFreeSite())) {
        document.title = 'Signing you in…';
        root.render(<SiteUnavailable kind='login' />);
        return;
    }

    // Apply document branding (tab title, favicon, web font, and primary color).
    applyDocumentTitle();
    applyFaviconFromLogo();
    applyBrandFontFromConfig();
    applyPrimaryColorFromConfig();

    root.render(<AuthWrapper />);
});
