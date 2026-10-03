import { Link } from 'react-router-dom';
import { getActiveSite } from '@/utils/site-settings';
import InfoPageLayout, { Callout, InfoSection } from './info-page-layout';

const AboutPage = () => {
    const site = getActiveSite();
    return (
    <InfoPageLayout eyebrow='Company' title='About us' accent='var(--brand-primary)'>
        {site && (site.about || site.vision || site.mission) && (
            <>
                {site.about && (
                    <InfoSection title={`About ${site.name}`}>
                        <p style={{ whiteSpace: 'pre-line' }}>{site.about}</p>
                    </InfoSection>
                )}
                {site.vision && (
                    <InfoSection title='Our vision'>
                        <p style={{ whiteSpace: 'pre-line' }}>{site.vision}</p>
                    </InfoSection>
                )}
                {site.mission && (
                    <InfoSection title='Our mission'>
                        <p style={{ whiteSpace: 'pre-line' }}>{site.mission}</p>
                    </InfoSection>
                )}
            </>
        )}
        <p>
            Executive Prime Markets (EPM) builds tools for people who trade on Deriv &mdash; a bot builder,
            charting, and automation interface layered on top of Deriv&apos;s own trading infrastructure.
        </p>
        <Callout>
            Executive Prime Markets is an independent software developer, not Deriv itself, and not owned
            by, affiliated with, or endorsed by Deriv.
        </Callout>

        <InfoSection title='Who we are'>
            <p>
                {/* TODO: replace with your real registered entity name/jurisdiction once available. */}
                Executive Prime Markets (EPM) builds and maintains client-side tools that connect to
                Deriv&apos;s public API using your own Deriv account credentials, via Deriv&apos;s own OAuth
                login flow. EPM doesn&apos;t run its own brokerage and doesn&apos;t issue its own trading
                accounts &mdash; every account you use on Executive Prime Markets is a Deriv account.
            </p>
            <p>
                Because Executive Prime Markets is a software layer rather than a financial institution, it
                is not a broker, an exchange, or a fund manager. What you will find on the site is a set of
                tools &mdash; a visual bot builder, ready-made Trading Bots, and charts &mdash; all of which
                work through your existing Deriv account.
            </p>
        </InfoSection>

        <InfoSection title='How Executive Prime Markets works'>
            <p>
                Under the hood, three things happen when you use Executive Prime Markets: you authenticate
                with Deriv through its standard OAuth screen, EPM&apos;s interface talks to Deriv&apos;s API
                on your behalf to read your balance and place the trades you or your bots request, and
                everything you build (a bot, a strategy, a chart layout) is either kept in your browser
                locally or, if you choose to, in your own Google Drive.
            </p>
            <p>
                EPM never sees your Deriv password, and at no point does a trade route through any
                infrastructure belonging to Executive Prime Markets before reaching Deriv &mdash; the API
                call goes straight from your browser to Deriv.
            </p>
            <p>
                In practice, Executive Prime Markets is the screen you work on and Deriv is the engine behind
                it: EPM shows you your balance, charts, and bots, while Deriv holds the account and executes
                every trade.
            </p>
        </InfoSection>

        <InfoSection title='Executive Prime Markets and Deriv'>
            <p>
                All trades placed through Executive Prime Markets are executed directly on your Deriv account
                via the Deriv API. EPM does not act as a broker, and does not place itself between you and
                Deriv as a counterparty to your trades.
            </p>
            <Callout>
                Deriv, not Executive Prime Markets, is the counterparty responsible for executing and
                settling your trades, holding your funds, and handling withdrawals and deposits.
            </Callout>
            <p>
                If you have a question about a trade, a deposit, a withdrawal, or your account verification,
                Deriv is the right place to ask, because Executive Prime Markets has no access to those
                systems. For questions about how the EPM website itself works, use our{' '}
                <Link to='/contact'>Contact us</Link> page.
            </p>
        </InfoSection>

        <InfoSection title='What Executive Prime Markets doesn&apos;t do'>
            <p>To be direct about what Executive Prime Markets is not:</p>
            <ul>
                <li>EPM doesn&apos;t hold, custody, or have access to your trading funds at any point.</li>
                <li>EPM doesn&apos;t give financial, investment, or trading advice.</li>
                <li>
                    EPM doesn&apos;t guarantee the performance of any bot, strategy, or template it provides.
                </li>
                <li>
                    EPM doesn&apos;t manage your account or trade on your behalf without you starting a bot.
                </li>
            </ul>
            <p>
                These limits are deliberate. Executive Prime Markets is designed so that you keep control of
                your Deriv account and your money at all times, and every trade a bot places is one you chose
                to start.
            </p>
            <p>
                See our <Link to='/legal/risk-disclosure'>Risk disclosure</Link> for the full detail on
                trading risk.
            </p>
        </InfoSection>

        <InfoSection title='The mission of Executive Prime Markets'>
            <p>
                Executive Prime Markets aims to make automated and discretionary trading on Deriv more
                accessible &mdash; through a visual bot builder, ready-made strategies, and a cleaner
                interface &mdash; without asking you to hand over custody of your funds or your account
                credentials to a third party.
            </p>
            <p>
                In practice that means keeping the tools simple to start with &mdash; a visual bot builder,
                ready-made Trading Bots you can load and adjust, and charts &mdash; while leaving the
                account, the funds, and the final decision with you.
            </p>
        </InfoSection>

        <InfoSection title='Questions'>
            <p>
                See our <Link to='/contact'>Contact us</Link> page for how to reach Executive Prime Markets,
                and our <Link to='/legal/risk-disclosure'>Risk disclosure</Link>,{' '}
                <Link to='/legal/terms'>Terms &amp; conditions</Link>, and{' '}
                <Link to='/legal/privacy-policy'>Privacy policy</Link> for the legal detail.
            </p>
            <p>
                If you&apos;re unsure which page answers your question, start with Contact us and mention
                what you&apos;re trying to do, so your message can be routed to the right place.
            </p>
        </InfoSection>
    </InfoPageLayout>
    );
};

export default AboutPage;
