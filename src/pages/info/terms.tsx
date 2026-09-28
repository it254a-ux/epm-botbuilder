import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout, InfoSection } from './info-page-layout';

const TermsPage = () => (
    <InfoPageLayout
        eyebrow='Legal'
        title='Terms & conditions'
        accent='var(--brand-tertiary)'
        updated='26 September 2026'
    >
        <p>
            These terms govern your use of Executive Prime Markets (EPM) &mdash; its bot builder, charting,
            and automation interface. By using Executive Prime Markets, you agree to them.
        </p>

        <InfoSection title='What Executive Prime Markets is'>
            <p>
                Executive Prime Markets (EPM) is a client-side interface that connects to your own Deriv
                account using the Deriv API and your Deriv OAuth login. It lets you build, run, and monitor
                trading bots and place trades on instruments Deriv makes available.
            </p>
            <p>
                Executive Prime Markets is a tool for using your Deriv account, not a replacement for it.
                Your Deriv account remains subject to Deriv&apos;s own terms, which apply alongside these
                terms.
            </p>
        </InfoSection>

        <InfoSection title='Eligibility'>
            <p>
                {/* TODO: set a real minimum age / eligibility statement for your jurisdiction. */}
                You must be legally able to hold a Deriv account and trade the instruments you access
                through Executive Prime Markets in your country of residence. It&apos;s your responsibility
                to check that using Executive Prime Markets, and trading through it, is lawful for you.
            </p>
            <p>
                Eligibility is checked by Deriv when you open and verify your Deriv account, not by
                Executive Prime Markets. If Deriv restricts or closes your account for any reason, you will
                no longer be able to trade through EPM with it.
            </p>
        </InfoSection>

        <InfoSection title='Executive Prime Markets does not hold your funds'>
            <Callout>
                Executive Prime Markets (EPM) does not hold, custody, or have access to your trading funds at
                any point.
            </Callout>
            <p>
                All deposits, withdrawals, balances, and trade execution are handled directly by Deriv on
                your Deriv account. EPM never sees or stores your Deriv account password; authentication
                happens through Deriv&apos;s own OAuth login flow, so your credentials pass straight to Deriv
                and never through Executive Prime Markets.
            </p>
            <p>
                Executive Prime Markets only ever sends trade instructions &mdash; built by you, or by a bot
                you configured &mdash; to Deriv&apos;s API using a session token Deriv issues after you log
                in. It cannot move funds between accounts, change your withdrawal details, or access your
                Deriv wallet outside of placing the trades you&apos;ve set up. If you ever revoke access from
                your Deriv account settings, EPM immediately loses the ability to place any further trades on
                your behalf.
            </p>
            <p>
                Because of this, Executive Prime Markets does not take deposits or process withdrawals; those
                happen on your Deriv account. If anyone asks you to send money to &ldquo;EPM&rdquo; directly,
                treat it with caution and let us know through our <Link to='/contact'>Contact us</Link> page.
            </p>
        </InfoSection>

        <InfoSection title='Your responsibilities'>
            <ul>
                <li>
                    You must be legally permitted to trade the instruments you access through Executive Prime
                    Markets.
                </li>
                <li>
                    You are responsible for any bot you build or run, including its logic, the stake sizes it
                    uses, and stopping it when you intend to.
                </li>
                <li>You are responsible for keeping your Deriv login and any API tokens confidential.</li>
                <li>You must not use Executive Prime Markets for any unlawful purpose.</li>
            </ul>
            <p>
                These responsibilities apply every time you use Executive Prime Markets, including when a bot
                is running while you are away from your device. If you are unsure whether something is
                permitted, contact us before doing it.
            </p>
        </InfoSection>

        <InfoSection title='Intellectual property'>
            <p>
                Executive Prime Markets itself &mdash; its interface, code, and design &mdash; belongs to EPM
                or its licensors. Bots and strategies you build yourself remain yours; you&apos;re
                responsible for anything you import from, or share to, a third party such as Google Drive.
            </p>
            <p>
                {/* TODO: have this reviewed for your jurisdiction before publishing. */}
                You may use Executive Prime Markets for your own trading, but you may not copy, resell, or
                redistribute EPM&apos;s interface, code, or design, or present it as your own work, without
                written permission.
            </p>
        </InfoSection>

        <InfoSection title='Third-party services'>
            <p>
                Executive Prime Markets relies on Deriv&apos;s API for all trading functionality, and
                optionally on Google Drive if you choose to import or save bots that way. Your use of those
                services is also governed by Deriv&apos;s and Google&apos;s own terms, which EPM doesn&apos;t
                control.
            </p>
            <p>
                Executive Prime Markets isn&apos;t responsible for outages, changes, or errors on
                Deriv&apos;s or Google&apos;s side. If Deriv&apos;s API is unavailable, bots and trades on
                EPM may not work until it is restored.
            </p>
        </InfoSection>

        <InfoSection title='No warranty'>
            <p>
                Executive Prime Markets is provided &ldquo;as is&rdquo;, without warranty of any kind. EPM
                does not guarantee that it will be uninterrupted, error-free, or free of bugs, or that any
                bot or strategy will perform as expected. See our{' '}
                <Link to='/legal/risk-disclosure'>Risk disclosure</Link> for trading-specific risks.
            </p>
            <p>
                You should test any bot on a Deriv demo account before running it with real money, and check
                that it behaves as you expect. Executive Prime Markets can&apos;t verify that a bot&apos;s
                logic matches what you intended.
            </p>
        </InfoSection>

        <InfoSection title='Limitation of liability'>
            <p>
                {/* TODO: have this reviewed for your jurisdiction before publishing. */}
                To the fullest extent permitted by law, Executive Prime Markets is not liable for any trading
                losses, lost profits, or indirect or consequential damages arising from your use of the
                site, including losses caused by bugs, downtime, or bot behavior.
            </p>
            <p>
                Nothing in these terms limits any right you have under law that cannot be excluded, or
                limits liability where the law does not allow it.
            </p>
        </InfoSection>

        <InfoSection title='Suspension and termination of access'>
            <p>
                {/* TODO: confirm this matches your actual moderation process before publishing. */}
                Executive Prime Markets may suspend or restrict access for anyone found to be using it
                unlawfully or abusively (for example, attempting to exploit or attack it). This
                doesn&apos;t affect your underlying Deriv account, which EPM doesn&apos;t control.
            </p>
            <p>
                Examples of abusive use include attempting to gain unauthorised access to Executive Prime
                Markets, overloading it with automated requests, or interfering with how it works for other
                users. If you believe access was restricted by mistake, use our{' '}
                <Link to='/contact'>Contact us</Link> page.
            </p>
        </InfoSection>

        <InfoSection title='Governing law and disputes'>
            {/* TODO: fill in the jurisdiction whose law actually governs these terms, then remove this note. */}
            <p>
                These terms are governed by the laws of the jurisdiction in which Executive Prime Markets is
                registered. Any dispute arising from them will be handled under that jurisdiction&apos;s
                courts, unless otherwise required by law.
            </p>
            <p>
                If you&apos;re unsure which jurisdiction that is, ask the Executive Prime Markets team
                through our <Link to='/contact'>Contact us</Link> page before relying on this section.
            </p>
        </InfoSection>

        <InfoSection title='Changes to these terms'>
            <p>
                Executive Prime Markets may update these terms from time to time; the &ldquo;Last
                updated&rdquo; date at the top of this page shows when they last changed. Continued use of
                Executive Prime Markets after a change means you accept the updated terms.
            </p>
            <p>
                Changes to how Executive Prime Markets works, such as new features that affect how your data
                or trades are handled, may be reflected in these terms, so it&apos;s worth checking this
                page occasionally.
            </p>
        </InfoSection>

        <InfoSection title='Contact'>
            <p>
                Questions about these terms can be sent to Executive Prime Markets through our{' '}
                <Link to='/contact'>Contact us</Link> page. Please don&apos;t include your Deriv password or
                API tokens in any message.
            </p>
            <p>
                When you contact us about these terms, mention which section you&apos;re asking about, so we
                can answer precisely.
            </p>
        </InfoSection>
    </InfoPageLayout>
);

export default TermsPage;
