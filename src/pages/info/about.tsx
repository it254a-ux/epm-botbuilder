import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout } from './info-page-layout';

const AboutPage = () => (
    <InfoPageLayout eyebrow='Company' title='About us' accent='var(--brand-primary)'>
        <p>
            Executive Prime Markets (EPM) builds tools for people who trade on Deriv &mdash; a bot builder,
            charting, and automation interface layered on top of Deriv&apos;s own trading infrastructure.
        </p>
        <Callout>
            We are an independent software developer, not Deriv itself, and not owned by, affiliated with,
            or endorsed by Deriv.
        </Callout>

        <section className='info-page__section'>
            <h2>Who we are</h2>
            <p>
                {/* TODO: replace with your real registered entity name/jurisdiction once available. */}
                EPM builds and maintains client-side tools that connect to Deriv&apos;s public API using
                your own Deriv account credentials, via Deriv&apos;s own OAuth login flow. We don&apos;t run
                our own brokerage, and we don&apos;t issue our own trading accounts &mdash; every account
                you use through this platform is a Deriv account.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>How the platform works</h2>
            <p>
                Under the hood, three things happen when you use EPM: you authenticate with Deriv through
                its standard OAuth screen, our interface talks to Deriv&apos;s API on your behalf to read
                your balance and place the trades you or your bots request, and everything you build (a bot,
                a strategy, a chart layout) is either kept in your browser locally or, if you choose to, in
                your own Google Drive.
            </p>
            <p>
                We never see your Deriv password, and at no point does a trade route through any
                infrastructure of ours before reaching Deriv &mdash; the API call goes straight from your
                browser to Deriv.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Our relationship with Deriv</h2>
            <p>
                All trades placed through this platform are executed directly on your Deriv account via the
                Deriv API. We do not act as a broker, and we do not place ourselves between you and Deriv as
                a counterparty to your trades.
            </p>
            <Callout>
                Deriv, not EPM, is the counterparty responsible for executing and settling your trades,
                holding your funds, and handling withdrawals and deposits.
            </Callout>
        </section>

        <section className='info-page__section'>
            <h2>What we don&apos;t do</h2>
            <p>To be direct about the boundaries of what this platform is:</p>
            <ul>
                <li>We don&apos;t hold, custody, or have access to your trading funds at any point.</li>
                <li>We don&apos;t give financial, investment, or trading advice.</li>
                <li>We don&apos;t guarantee the performance of any bot, strategy, or template we provide.</li>
                <li>We don&apos;t manage your account or trade on your behalf without you starting a bot.</li>
            </ul>
            <p>
                See our <Link to='/legal/risk-disclosure'>Risk disclosure</Link> for the full detail on
                trading risk.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Our mission</h2>
            <p>
                We aim to make automated and discretionary trading on Deriv more accessible &mdash; through
                a visual bot builder, ready-made strategies, and a cleaner interface &mdash; without asking
                you to hand over custody of your funds or your account credentials to a third party.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Questions</h2>
            <p>
                See our <Link to='/contact'>Contact us</Link> page for how to reach us, and our{' '}
                <Link to='/legal/risk-disclosure'>Risk disclosure</Link>,{' '}
                <Link to='/legal/terms'>Terms &amp; conditions</Link>, and{' '}
                <Link to='/legal/privacy-policy'>Privacy policy</Link> for the legal detail.
            </p>
        </section>
    </InfoPageLayout>
);

export default AboutPage;
