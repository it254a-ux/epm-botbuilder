import InfoPageLayout from './info-page-layout';

const TermsPage = () => (
    <InfoPageLayout title='Terms & conditions' updated='26 September 2026'>
        <p>
            These terms govern your use of the Executive Prime Markets (EPM) bot builder, charting, and
            automation interface (&ldquo;the software&rdquo;). By using it, you agree to them.
        </p>

        <h2>What the software is</h2>
        <p>
            The software is a client-side interface that connects to your own Deriv account using the
            Deriv API and your Deriv OAuth login. It lets you build, run, and monitor trading bots and
            place trades on instruments Deriv makes available.
        </p>

        <h2>We do not hold your funds</h2>
        <p>
            <strong>EPM does not hold, custody, or have access to your trading funds at any point.</strong>{' '}
            All deposits, withdrawals, balances, and trade execution are handled directly by Deriv on your
            Deriv account. We never see or store your Deriv account password; authentication happens through
            Deriv&apos;s own OAuth login flow.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
            <li>You must be legally permitted to trade the instruments you access through this software.</li>
            <li>
                You are responsible for any bot you build or run, including its logic, the stake sizes it
                uses, and stopping it when you intend to.
            </li>
            <li>You are responsible for keeping your Deriv login and any API tokens confidential.</li>
            <li>You must not use the software for any unlawful purpose.</li>
        </ul>

        <h2>No warranty</h2>
        <p>
            The software is provided &ldquo;as is&rdquo;, without warranty of any kind. We do not guarantee
            that it will be uninterrupted, error-free, or free of bugs, or that any bot or strategy will
            perform as expected. See our <a href='/legal/risk-disclosure'>Risk disclosure</a> for trading-
            specific risks.
        </p>

        <h2>Limitation of liability</h2>
        <p>
            {/* TODO: have this reviewed for your jurisdiction before publishing. */}
            To the fullest extent permitted by law, EPM is not liable for any trading losses, lost profits,
            or indirect or consequential damages arising from your use of the software, including losses
            caused by bugs, downtime, or bot behavior.
        </p>

        <h2>Changes to these terms</h2>
        <p>
            We may update these terms from time to time. Continued use of the software after a change means
            you accept the updated terms.
        </p>

        <h2>Contact</h2>
        <p>
            Questions about these terms can be sent through our <a href='/contact'>Contact us</a> page.
        </p>
    </InfoPageLayout>
);

export default TermsPage;
