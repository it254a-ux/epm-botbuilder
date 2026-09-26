import InfoPageLayout from './info-page-layout';

const AboutPage = () => (
    <InfoPageLayout title='About us'>
        <p>
            Executive Prime Markets (EPM) builds tools for people who trade on Deriv &mdash; a bot builder,
            charting, and automation interface layered on top of Deriv&apos;s own trading infrastructure.
        </p>

        <h2>Who we are</h2>
        <p>
            {/* TODO: replace with your real registered entity name/jurisdiction once available. */}
            EPM is an independent software developer. We are not Deriv, and we are not owned by, affiliated
            with, or endorsed by Deriv. We build and maintain client-side tools that connect to Deriv&apos;s
            public API using your own Deriv account credentials.
        </p>

        <h2>Our relationship with Deriv</h2>
        <p>
            All trades placed through this platform are executed directly on your Deriv account via the
            Deriv API. We do not act as a broker, and we do not place ourselves between you and Deriv as a
            counterparty to your trades. Deriv, not EPM, is the counterparty responsible for executing and
            settling your trades, holding your funds, and handling withdrawals and deposits.
        </p>

        <h2>Our mission</h2>
        <p>
            We aim to make automated and discretionary trading on Deriv more accessible &mdash; through a
            visual bot builder, ready-made strategies, and a cleaner interface &mdash; without asking you to
            hand over custody of your funds or your account credentials to a third party.
        </p>

        <h2>Questions</h2>
        <p>
            See our <a href='/contact'>Contact us</a> page for how to reach us, and our{' '}
            <a href='/legal/risk-disclosure'>Risk disclosure</a>,{' '}
            <a href='/legal/terms'>Terms &amp; conditions</a>, and{' '}
            <a href='/legal/privacy-policy'>Privacy policy</a> for the legal detail.
        </p>
    </InfoPageLayout>
);

export default AboutPage;
