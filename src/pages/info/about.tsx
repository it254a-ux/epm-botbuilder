import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout } from './info-page-layout';

const AboutPage = () => (
    <InfoPageLayout eyebrow='Company' title='About us' accent='var(--brand-primary)'>
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
            counterparty to your trades.
        </p>
        <Callout>
            Deriv, not EPM, is the counterparty responsible for executing and settling your trades, holding
            your funds, and handling withdrawals and deposits.
        </Callout>

        <h2>Our mission</h2>
        <p>
            We aim to make automated and discretionary trading on Deriv more accessible &mdash; through a
            visual bot builder, ready-made strategies, and a cleaner interface &mdash; without asking you to
            hand over custody of your funds or your account credentials to a third party.
        </p>

        <h2>Questions</h2>
        <p>
            See our <Link to='/contact'>Contact us</Link> page for how to reach us, and our{' '}
            <Link to='/legal/risk-disclosure'>Risk disclosure</Link>,{' '}
            <Link to='/legal/terms'>Terms &amp; conditions</Link>, and{' '}
            <Link to='/legal/privacy-policy'>Privacy policy</Link> for the legal detail.
        </p>
    </InfoPageLayout>
);

export default AboutPage;
