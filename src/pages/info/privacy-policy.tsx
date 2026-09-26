import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout } from './info-page-layout';

const PrivacyPolicyPage = () => (
    <InfoPageLayout eyebrow='Legal' title='Privacy policy' accent='var(--brand-success)' updated='26 September 2026'>
        <p>
            This page explains what data Executive Prime Markets (EPM) collects when you use our bot
            builder and trading interface, and how we handle it.
        </p>

        <h2>Data from your Deriv account</h2>
        <p>
            When you log in, Deriv&apos;s own OAuth flow shares a limited set of account details with us
            (such as your login ID, currency, and account list) so the interface can show your balance and
            place trades on your behalf. We never see or store your Deriv password. Your session token is
            kept in your browser&apos;s local storage, on your device, so you stay logged in between visits
            &mdash; it is not stored on our servers.
        </p>

        <h2>Data stored on your device</h2>
        <p>Your browser&apos;s local storage is also used to remember, on your device only:</p>
        <ul>
            <li>Your theme (light/dark) and language preference</li>
            <li>Which account you last had active</li>
            <li>Bots you&apos;ve built or imported, saved locally for the &ldquo;Local&rdquo; bot list</li>
        </ul>

        <h2>Google Drive (optional)</h2>
        <p>
            If you choose to import or save a bot from Google Drive, you&apos;ll be asked to grant access to
            your Google account through Google&apos;s own consent screen. We only request access to the
            files you explicitly open or save through that feature, not your whole Drive, and that access is
            governed by Google&apos;s own privacy policy.
        </p>

        <h2>Support / live chat (where enabled)</h2>
        <p>
            If you contact us through in-app live chat, basic account details (such as your login ID,
            currency, and email) may be shared with our support-chat provider so they can assist you.{' '}
            {/* TODO: name the actual chat provider once one is in use. */}
        </p>

        <h2>Cookies</h2>
        <p>
            We use cookies and local storage for functionality described above (staying logged in,
            remembering preferences) rather than third-party advertising tracking. Your browser lets you
            block or clear cookies at any time; doing so may log you out or reset preferences.
        </p>

        <h2>What we don&apos;t do</h2>
        <Callout>We do not sell your personal data, and we do not have access to your trading funds.</Callout>

        <h2>Your rights</h2>
        <p>
            {/* TODO: confirm which regime(s) actually apply to your users/entity before publishing. */}
            Depending on where you&apos;re located (for example, under GDPR in the EU/UK), you may have the
            right to access, correct, or request deletion of personal data we hold about you, and to object
            to certain processing. Most of what we hold lives in your own browser&apos;s local storage,
            which you can clear yourself at any time; for anything else, contact us using the details below.
        </p>

        <h2>Contact</h2>
        <p>
            For any privacy question or request, see our <Link to='/contact'>Contact us</Link> page.
        </p>
    </InfoPageLayout>
);

export default PrivacyPolicyPage;
