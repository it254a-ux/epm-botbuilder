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

        <h2>Leverage and volatility</h2>
        <p>
            Many of the instruments available through Deriv&apos;s API &mdash; including synthetic indices,
            options, and CFDs &mdash; are leveraged. Leverage can magnify both gains and losses, and losses
            can exceed your initial deposit on some instrument types. Prices can move quickly and
            unpredictably, including outside of traditional market hours.
        </p>

        <h2>Automated trading (bots) carries its own risks</h2>
        <p>
            This platform lets you build and run automated trading bots. A bot executes its programmed
            logic exactly as written, without judgment, and will keep trading through adverse market
            conditions, connectivity issues, or bugs in its own strategy unless you stop it. Backtested or
            simulated performance does not guarantee future results. You are solely responsible for
            testing, monitoring, and stopping any bot you run.
        </p>

        <h2>We are a technology provider, not an advisor</h2>
        <p>
            EPM provides software only. Nothing on this platform, including any &ldquo;quick strategy&rdquo;
            template, tutorial, or example bot, is financial, investment, or trading advice, and no EPM
            content should be relied on as a recommendation to buy, sell, or hold any instrument. Trading
            decisions, and their outcomes, are entirely your own.
        </p>

        <h2>We do not hold your funds</h2>
        <p>
            All funds, trades, and account balances are held and executed by Deriv, not by EPM. See our{' '}
            <Link to='/about'>About us</Link> and <Link to='/legal/terms'>Terms &amp; conditions</Link> for
            detail on this relationship.
        </p>

        <p>
            If you are unsure whether trading these instruments is right for you, consider seeking
            independent financial advice before proceeding.
        </p>
    </InfoPageLayout>
);

export default RiskDisclosurePage;
