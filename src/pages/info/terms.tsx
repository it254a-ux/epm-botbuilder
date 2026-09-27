import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout } from './info-page-layout';

const TermsPage = () => (
    <InfoPageLayout
        eyebrow='Legal'
        title='Terms & conditions'
        accent='var(--brand-tertiary)'
        updated='26 September 2026'
    >
        <p>
            These terms govern your use of the Executive Prime Markets (EPM) bot builder, charting, and
            automation interface (&ldquo;the software&rdquo;). By using it, you agree to them.
        </p>

        <section className='info-page__section'>
            <h2>What the software is</h2>
            <p>
                The software is a client-side interface that connects to your own Deriv account using the
                Deriv API and your Deriv OAuth login. It lets you build, run, and monitor trading bots and
                place trades on instruments Deriv makes available.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Eligibility</h2>
            <p>
                {/* TODO: set a real minimum age / eligibility statement for your jurisdiction. */}
                You must be legally able to hold a Deriv account and trade the instruments you access
                through this software in your country of residence. It&apos;s your responsibility to check
                that using this software, and trading through it, is lawful for you.
            </p>
        </section>

        <section className='info-page__section info-page__section--featured'>
            <h2>We do not hold your funds</h2>
            <Callout>EPM does not hold, custody, or have access to your trading funds at any point.</Callout>
            <p>
                All deposits, withdrawals, balances, and trade execution are handled directly by Deriv on
                your Deriv account. We never see or store your Deriv account password; authentication
                happens through Deriv&apos;s own OAuth login flow, so your credentials pass straight to
                Deriv and never through our servers.
            </p>
            <p>
                The software only ever sends trade instructions &mdash; built by you, or by a bot you
                configured &mdash; to Deriv&apos;s API using a session token Deriv issues after you log in.
                It cannot move funds between accounts, change your withdrawal details, or access your
                Deriv wallet outside of placing the trades you&apos;ve set up. If you ever revoke access
                from your Deriv account settings, the software immediately loses the ability to place any
                further trades on your behalf.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Your responsibilities</h2>
            <ul>
                <li>You must be legally permitted to trade the instruments you access through this software.</li>
                <li>
                    You are responsible for any bot you build or run, including its logic, the stake sizes
                    it uses, and stopping it when you intend to.
                </li>
                <li>You are responsible for keeping your Deriv login and any API tokens confidential.</li>
                <li>You must not use the software for any unlawful purpose.</li>
            </ul>
        </section>

        <section className='info-page__section'>
            <h2>Intellectual property</h2>
            <p>
                The software itself &mdash; its interface, code, and design &mdash; belongs to EPM or its
                licensors. Bots and strategies you build yourself remain yours; you&apos;re responsible for
                anything you import from, or share to, a third party such as Google Drive.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Third-party services</h2>
            <p>
                The software relies on Deriv&apos;s API for all trading functionality, and optionally on
                Google Drive if you choose to import or save bots that way. Your use of those services is
                also governed by Deriv&apos;s and Google&apos;s own terms, which we don&apos;t control.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>No warranty</h2>
            <p>
                The software is provided &ldquo;as is&rdquo;, without warranty of any kind. We do not
                guarantee that it will be uninterrupted, error-free, or free of bugs, or that any bot or
                strategy will perform as expected. See our{' '}
                <Link to='/legal/risk-disclosure'>Risk disclosure</Link> for trading-specific risks.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Limitation of liability</h2>
            <p>
                {/* TODO: have this reviewed for your jurisdiction before publishing. */}
                To the fullest extent permitted by law, EPM is not liable for any trading losses, lost
                profits, or indirect or consequential damages arising from your use of the software,
                including losses caused by bugs, downtime, or bot behavior.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Suspension and termination of access</h2>
            <p>
                {/* TODO: confirm this matches your actual moderation process before publishing. */}
                We may suspend or restrict access to the software for anyone found to be using it unlawfully
                or abusively (for example, attempting to exploit or attack it). This doesn&apos;t affect
                your underlying Deriv account, which we don&apos;t control.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Governing law and disputes</h2>
            {/* TODO: fill in the jurisdiction whose law actually governs these terms, then remove this note. */}
            <p>
                These terms are governed by the laws of the jurisdiction in which EPM is registered. Any
                dispute arising from them will be handled under that jurisdiction&apos;s courts, unless
                otherwise required by law.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Changes to these terms</h2>
            <p>
                We may update these terms from time to time. Continued use of the software after a change
                means you accept the updated terms.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Contact</h2>
            <p>
                Questions about these terms can be sent through our <Link to='/contact'>Contact us</Link>{' '}
                page.
            </p>
        </section>
    </InfoPageLayout>
);

export default TermsPage;
