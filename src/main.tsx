import { configure } from 'mobx';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
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
import './styles/index.scss';

// Configure MobX to handle multiple instances in production builds
configure({ isolateGlobalState: true });

// Perform version check FIRST - before any other operations
performVersionCheck();

// Consume any incoming ?token=&acct= from the dashboard's iframe embed BEFORE
// anything else runs. getAccountId() is what actually stores the token as
// auth_info and the account id as active_loginid (see account-helpers.ts).
// This must happen before the app mounts: api_base picks an authenticated vs.
// public WebSocket URL once, the first time it connects, so auth_info has to
// already be in localStorage by then — not moments later once a component
// happens to call getAccountId() on its own.
getAccountId();

// Apply deploy-time document branding (tab title, favicon, web font, and primary color).
applyDocumentTitle();
applyFaviconFromLogo();
applyBrandFontFromConfig();
applyPrimaryColorFromConfig();

// Removed AnalyticsInitializer() call - analytics dependency removed

// App Builder preview branding (incl. PREVIEW_READY handshake) is handled by the
// src/preview/ listener, mounted from app-content only in the preview deployment
// (NEXT_PUBLIC_APP_BUILD === 'true') and stripped from standalone partner deploys.
ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
