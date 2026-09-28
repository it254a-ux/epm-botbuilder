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
            This page explains what data Executive Prime Markets (EPM) collects when you use its bot builder
            and trading interface, and how that data is handled.
        </p>
        <Callout>
            Executive Prime Markets does not sell your personal data, and does not have access to your
            trading funds.
        </Callout>

        <InfoSection title='Data from your Deriv account'>
            <p>
                When you log in, Deriv&apos;s own OAuth flow shares a limited set of account details with
                Executive Prime Markets (such as your login ID, currency, and account list) so the interface
                can show your balance and place trades on your behalf. EPM never sees or stores your Deriv
                password. Your session token is kept in your browser&apos;s local storage, on your device, so
                you stay logged in between visits &mdash; it is not stored on EPM&apos;s servers.
            </p>
            <p>
                You can end this at any time by logging out of Executive Prime Markets or by revoking the
                connection from your Deriv account settings, after which the site can no longer access your
                account details.
            </p>
        </InfoSection>

        <InfoSection title='Data stored on your device'>
            <p>
                Your browser&apos;s local storage is also used by Executive Prime Markets to remember, on
                your device only:
            </p>
            <ul>
                <li>Your theme (light/dark) and language preference</li>
                <li>Which account you last had active</li>
                <li>Bots you&apos;ve built or imported, saved locally for the &ldquo;Local&rdquo; bot list</li>
            </ul>
            <p>
                This data stays on the device and browser you used. Executive Prime Markets doesn&apos;t sync
                it between devices, so a bot saved on your laptop won&apos;t appear on your phone unless you
                export it or use Google Drive.
            </p>
        </InfoSection>

        <InfoSection title='Google Drive (optional)'>
            <p>
                If you choose to import or save a bot from Google Drive on Executive Prime Markets,
                you&apos;ll be asked to grant access to your Google account through Google&apos;s own consent
                screen. EPM only requests access to the files you explicitly open or save through that
                feature, not your whole Drive, and that access is governed by Google&apos;s own privacy
                policy.
            </p>
            <p>
                Executive Prime Markets does not need Google Drive to work. If you&apos;d rather not connect
                it, you can keep your bots locally and skip this feature; you can also remove EPM&apos;s
                access at any time from your Google Account&apos;s security settings.
            </p>
        </InfoSection>

        <InfoSection title='Support / live chat'>
            <p>
                {/* TODO: name the actual chat provider once one is in use. */}
                If you contact Executive Prime Markets through in-app live chat, basic account details (such
                as your login ID, currency, and email) may be shared with EPM&apos;s support-chat provider so
                they can assist you.
            </p>
            <p>
                Chat is optional. If you&apos;d prefer not to share those details, you can contact Executive
                Prime Markets by email through our <Link to='/contact'>Contact us</Link> page instead.
            </p>
        </InfoSection>

        <InfoSection title='Cookies'>
            <p>
                Executive Prime Markets uses cookies and local storage for the functionality described above
                (staying logged in, remembering preferences) rather than third-party advertising tracking.
                Your browser lets you block or clear cookies at any time; doing so may log you out or reset
                preferences.
            </p>
            <p>
                You can clear cookies and local storage from your browser settings whenever you like. Doing
                so means Executive Prime Markets will forget your preferences and you&apos;ll need to log in
                again with Deriv.
            </p>
        </InfoSection>

        <InfoSection title='Legal basis for processing'>
            <p>
                {/* TODO: confirm this framing matches your actual legal basis once reviewed. */}
                Where data protection law requires a legal basis (such as under GDPR), Executive Prime
                Markets relies on it being necessary to provide the service you&apos;ve asked for &mdash;
                showing your Deriv balance and placing your trades &mdash; and, for anything optional like
                Google Drive, on your explicit consent given at the point you connect it.
            </p>
            <p>
                Where you&apos;ve given consent, such as connecting Google Drive, you can withdraw it at any
                time by disconnecting that feature. Withdrawing consent doesn&apos;t affect anything Executive
                Prime Markets did before you withdrew it.
            </p>
        </InfoSection>

        <InfoSection title='Data retention'>
            <p>
                Most of what is described on this page lives in your own browser&apos;s local storage and
                stays there until you clear it yourself or clear your browser data &mdash; Executive Prime
                Markets doesn&apos;t hold a separate copy on its servers. Live chat logs, where enabled, are
                retained by EPM&apos;s chat provider under their own retention policy.
            </p>
            <p>
                To remove what Executive Prime Markets has stored on your device, clear the site&apos;s data
                in your browser settings; this deletes your saved bots, preferences, and login session from
                that device. Export any bots you want to keep first.
            </p>
        </InfoSection>

        <InfoSection title='International data transfers'>
            <p>
                {/* TODO: confirm where Deriv, Google, and any chat provider actually process data. */}
                Deriv, Google, and any support-chat provider Executive Prime Markets uses may process data in
                countries other than your own. Each operates under its own safeguards for cross-border
                transfers; check their respective privacy policies for detail.
            </p>
            <p>
                Because Executive Prime Markets connects your browser directly to Deriv, the location where
                your trading data is processed is decided by Deriv, not by EPM. Check Deriv&apos;s privacy
                policy for the details that apply to your account.
            </p>
        </InfoSection>

        <InfoSection title='Security measures'>
            <p>
                All communication between your browser, Executive Prime Markets, and Deriv&apos;s API
                happens over encrypted HTTPS connections. Because EPM never sees your Deriv password and
                never holds your funds, a large class of the most damaging breaches (credential theft,
                stolen funds) simply has nothing of Executive Prime Markets&apos; to compromise.
            </p>
            <p>
                You can help keep your account safe too: use a strong, unique Deriv password, enable any
                two-factor protection Deriv offers, log out on shared devices, and don&apos;t share your
                Deriv API tokens with anyone.
            </p>
        </InfoSection>

        <InfoSection title='Children&apos;s privacy'>
            <p>
                {/* TODO: confirm the actual minimum age Deriv requires for account holders. */}
                Executive Prime Markets is not directed at children and requires a Deriv account, which
                itself has its own minimum age requirement. EPM doesn&apos;t knowingly collect data from
                anyone below that age.
            </p>
            <p>
                If you believe a child has used Executive Prime Markets, or that information about a child
                has been shared with it, please contact us through our{' '}
                <Link to='/contact'>Contact us</Link> page so we can look into it.
            </p>
        </InfoSection>

        <InfoSection title='Your rights'>
            <p>
                {/* TODO: confirm which regime(s) actually apply to your users/entity before publishing. */}
                Depending on where you&apos;re located (for example, under GDPR in the EU/UK), you may have
                the right to access, correct, or request deletion of personal data Executive Prime Markets
                holds about you, and to object to certain processing. Most of what EPM holds lives in your
                own browser&apos;s local storage, which you can clear yourself at any time; for anything
                else, contact us using the details below.
            </p>
            <p>
                When you contact Executive Prime Markets about your rights, say which right you want to use
                and what data it concerns, so the request can be handled quickly. We may need to confirm who
                you are first.
            </p>
        </InfoSection>

        <InfoSection title='Changes to this policy'>
            <p>
                Executive Prime Markets may update this policy from time to time as the site changes; the
                &ldquo;Last updated&rdquo; date at the top of this page shows when it last changed.
                Continued use of Executive Prime Markets after an update means you accept the revised
                policy.
            </p>
            <p>
                If a change affects how your data is used in a significant way, it will be reflected on this
                page, so it&apos;s worth checking back from time to time.
            </p>
        </InfoSection>

        <InfoSection title='Contact'>
            <p>
                For any privacy question or request about Executive Prime Markets, see our{' '}
                <Link to='/contact'>Contact us</Link> page. Please don&apos;t include your Deriv password or
                API tokens in any message.
            </p>
            <p>
                For requests about your Deriv account data itself, such as your trading history or
                verification documents, contact Deriv directly, since Executive Prime Markets does not hold
                that information.
            </p>
        </InfoSection>
    </InfoPageLayout>
);

export default PrivacyPolicyPage;
