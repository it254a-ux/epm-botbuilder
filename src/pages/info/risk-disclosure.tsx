import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout } from './info-page-layout';

const RiskDisclosurePage = () => (
    <InfoPageLayout
        eyebrow='Legal'
        title='Risk disclosure'
        accent='var(--brand-warning)'
        updated='26 September 2026'
    >
        <Callout>
            Trading derivatives, options, and CFDs carries a high level of risk and may not be suitable for
            everyone. You could lose some or all of your invested capital.
        </Callout>
        <p>Please read this page in full before using Executive Prime Markets (EPM) to trade.</p>

        <section className='info-page__section'>
            <h2>Leverage and volatility</h2>
            <p>
                Many of the instruments available through Deriv&apos;s API &mdash; including synthetic
                indices, options, and CFDs &mdash; are leveraged. Leverage can magnify both gains and
                losses, and losses can exceed your initial deposit on some instrument types. Prices can move
                quickly and unpredictably, including outside of traditional market hours.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Automated trading (bots) carries its own risks</h2>
            <p>
                This platform lets you build and run automated trading bots. A bot executes its programmed
                logic exactly as written, without judgment, and will keep trading through adverse market
                conditions, connectivity issues, or bugs in its own strategy unless you stop it. You are
                solely responsible for testing, monitoring, and stopping any bot you run.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Past performance and backtesting</h2>
            <p>
                Backtested, simulated, or historical performance shown by a bot, template, or strategy does
                not guarantee future results. Market conditions change, and a strategy that performed well
                in the past, or in a demo account, may perform very differently going forward or on a real
                account.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Slippage, execution, and connectivity risk</h2>
            <p>
                The price at which an order actually executes can differ from the price you saw when placing
                it, particularly during fast-moving markets. A bot&apos;s decisions also depend on your own
                device and internet connection staying online &mdash; a dropped connection, closed browser
                tab, or device going to sleep can stop a bot from managing an open position as intended.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Market and liquidity risk</h2>
            <p>
                Deriv&apos;s synthetic indices are generated continuously, including on weekends and
                holidays, and can exhibit sharp, sudden moves. Traditional market instruments (forex,
                commodities, stock indices) carry their own liquidity risk around news events, market open
                and close, and low-volume periods.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>No investor compensation scheme</h2>
            <p>
                {/* TODO: confirm the actual regulatory status/protections that apply to your users' Deriv accounts. */}
                Funds held with Deriv may not be covered by a government deposit insurance or investor
                compensation scheme in the same way a bank account might be. Check Deriv&apos;s own terms
                and regulatory disclosures for what protections, if any, apply to your account.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>We are a technology provider, not an advisor</h2>
            <p>
                EPM provides software only. Nothing on this platform, including any &ldquo;quick
                strategy&rdquo; template, tutorial, or example bot, is financial, investment, or trading
                advice, and no EPM content should be relied on as a recommendation to buy, sell, or hold any
                instrument. Trading decisions, and their outcomes, are entirely your own.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>We do not hold your funds</h2>
            <p>
                All funds, trades, and account balances are held and executed by Deriv, not by EPM. See our{' '}
                <Link to='/about'>About us</Link> and <Link to='/legal/terms'>Terms &amp; conditions</Link>{' '}
                for detail on this relationship.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Your responsibility to assess suitability</h2>
            <p>
                Before trading, consider your own financial situation, experience, and risk tolerance. If
                you are unsure whether trading these instruments is right for you, consider seeking
                independent financial advice before proceeding.
            </p>
        </section>
    </InfoPageLayout>
);

export default RiskDisclosurePage;
