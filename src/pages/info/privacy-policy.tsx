import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout, InfoSection } from './info-page-layout';

const PrivacyPolicyPage = () => (
    <InfoPageLayout
        eyebrow='Legal'
        title='Privacy policy'
        accent='var(--brand-success)'
        updated='26 September 2026'
    >
        <p>
            This page explains what data Executive Prime Markets (EPM) collects when you use our bot
            builder and trading interface, and how we handle it.
        </p>
        <Callout>We do not sell your personal data, and we do not have access to your trading funds.</Callout>

        <InfoSection title='Data from your Deriv account'>
            <p>
                When you log in, Deriv&apos;s own OAuth flow shares a limited set of account details with us
                (such as your login ID, currency, and account list) so the interface can show your balance
                and place trades on your behalf. We never see or store your Deriv password. Your session
                token is kept in your browser&apos;s local storage, on your device, so you stay logged in
                between visits &mdash; it is not stored on our servers.
            </p>
        </InfoSection>

        <InfoSection title='Data stored on your device'>
            <p>Your browser&apos;s local storage is also used to remember, on your device only:</p>
            <ul>
                <li>Your theme (light/dark) and language preference</li>
                <li>Which account you last had active</li>
                <li>Bots you&apos;ve built or imported, saved locally for the &ldquo;Local&rdquo; bot list</li>
            </ul>
        </InfoSection>

        <InfoSection title='Google Drive (optional)'>
            <p>
                If you choose to import or save a bot from Google Drive, you&apos;ll be asked to grant
                access to your Google account through Google&apos;s own consent screen. We only request
                access to the files you explicitly open or save through that feature, not your whole Drive,
                and that access is governed by Google&apos;s own privacy policy.
            </p>
        </InfoSection>

        <InfoSection title='Support / live chat'>
            <p>
                {/* TODO: name the actual chat provider once one is in use. */}
                If you contact us through in-app live chat, basic account details (such as your login ID,
                currency, and email) may be shared with our support-chat provider so they can assist you.
            </p>
        </InfoSection>

        <InfoSection title='Cookies'>
            <p>
                We use cookies and local storage for functionality described above (staying logged in,
                remembering preferences) rather than third-party advertising tracking. Your browser lets you
                block or clear cookies at any time; doing so may log you out or reset preferences.
            </p>
        </InfoSection>

        <InfoSection title='Legal basis for processing'>
            <p>
                {/* TODO: confirm this framing matches your actual legal basis once reviewed. */}
                Where data protection law requires a legal basis (such as under GDPR), we rely on it being
                necessary to provide the service you&apos;ve asked for &mdash; showing your Deriv balance
                and placing your trades &mdash; and, for anything optional like Google Drive, on your
                explicit consent given at the point you connect it.
            </p>
        </InfoSection>

        <InfoSection title='Data retention'>
            <p>
                Most of what we&apos;ve described lives in your own browser&apos;s local storage and stays
                there until you clear it yourself or clear your browser data &mdash; we don&apos;t hold a
                separate copy on our servers. Live chat logs, where enabled, are retained by our chat
                provider under their own retention policy.
            </p>
        </InfoSection>

        <InfoSection title='International data transfers'>
            <p>
                {/* TODO: confirm where Deriv, Google, and any chat provider actually process data. */}
                Deriv, Google, and any support-chat provider we use may process data in countries other
                than your own. Each operates under its own safeguards for cross-border transfers; check
                their respective privacy policies for detail.
            </p>
        </InfoSection>

        <InfoSection title='Security measures'>
            <p>
                All communication between your browser, this interface, and Deriv&apos;s API happens over
                encrypted HTTPS connections. Because we never see your Deriv password and never hold your
                funds, a large class of the most damaging breaches (credential theft, stolen funds) simply
                has nothing of ours to compromise.
            </p>
        </InfoSection>

        <InfoSection title='Children&apos;s privacy'>
            <p>
                {/* TODO: confirm the actual minimum age Deriv requires for account holders. */}
                This software is not directed at children and requires a Deriv account, which itself has its
                own minimum age requirement. We don&apos;t knowingly collect data from anyone below that
                age.
            </p>
        </InfoSection>

        <InfoSection title='Your rights'>
            <p>
                {/* TODO: confirm which regime(s) actually apply to your users/entity before publishing. */}
                Depending on where you&apos;re located (for example, under GDPR in the EU/UK), you may have
                the right to access, correct, or request deletion of personal data we hold about you, and to
                object to certain processing. Most of what we hold lives in your own browser&apos;s local
                storage, which you can clear yourself at any time; for anything else, contact us using the
                details below.
            </p>
        </InfoSection>

        <InfoSection title='Changes to this policy'>
            <p>
                We may update this policy from time to time as the software changes; the &ldquo;Last
                updated&rdquo; date at the top of this page shows when it last changed. Continued use of the
                software after an update means you accept the revised policy.
            </p>
        </InfoSection>

        <InfoSection title='Contact'>
            <p>
                For any privacy question or request, see our <Link to='/contact'>Contact us</Link> page.
                Please don&apos;t include your Deriv password or API tokens in any message to us.
            </p>
        </InfoSection>
    </InfoPageLayout>
);

export default PrivacyPolicyPage;
