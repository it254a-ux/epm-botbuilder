import { Link } from 'react-router-dom';
import InfoPageLayout, { Callout, InfoSection } from './info-page-layout';

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

        <InfoSection title='Leverage and volatility'>
            <p>
                Many of the instruments available through Deriv&apos;s API on Executive Prime Markets
                &mdash; including synthetic indices, options, and CFDs &mdash; are leveraged. Leverage can
                magnify both gains and losses, and losses can exceed your initial deposit on some instrument
                types. Prices can move quickly and unpredictably, including outside of traditional market
                hours.
            </p>
            <p>
                Only trade with money you can afford to lose. Executive Prime Markets does not choose your
                stake sizes or guarantee any limit on your losses; the amount at risk on each trade is
                whatever you, or a bot you run, decide.
            </p>
        </InfoSection>

        <InfoSection title='Automated trading (bots) carries its own risks'>
            <p>
                Executive Prime Markets lets you build and run automated trading bots. A bot executes its
                programmed logic exactly as written, without judgment, and will keep trading through adverse
                market conditions, connectivity issues, or bugs in its own strategy unless you stop it. You
                are solely responsible for testing, monitoring, and stopping any bot you run.
            </p>
            <p>
                Test a new bot on a Deriv demo account first, start with small stakes, and check on it
                regularly. The ready-made Trading Bots on Executive Prime Markets are examples for you to
                study and adjust, not tested recommendations.
            </p>
        </InfoSection>

        <InfoSection title='Past performance and backtesting'>
            <p>
                Backtested, simulated, or historical performance shown by a bot, template, or strategy on
                Executive Prime Markets does not guarantee future results. Market conditions change, and a
                strategy that performed well in the past, or in a demo account, may perform very differently
                going forward or on a real account.
            </p>
            <p>
                Any results you see on Executive Prime Markets, such as backtests or demo-account outcomes,
                describe the past under specific conditions only.
            </p>
        </InfoSection>

        <InfoSection title='Slippage, execution, and connectivity risk'>
            <p>
                The price at which an order actually executes can differ from the price you saw when placing
                it, particularly during fast-moving markets. A bot&apos;s decisions on Executive Prime
                Markets also depend on your own device and internet connection staying online &mdash; a
                dropped connection, closed browser tab, or device going to sleep can stop a bot from managing
                an open position as intended.
            </p>
            <p>
                To reduce this risk, keep your device charged and connected while a bot runs, and don&apos;t
                close the Executive Prime Markets tab while it has open trades.
            </p>
        </InfoSection>

        <InfoSection title='Market and liquidity risk'>
            <p>
                Deriv&apos;s synthetic indices are generated continuously, including on weekends and
                holidays, and can exhibit sharp, sudden moves. Traditional market instruments (forex,
                commodities, stock indices) carry their own liquidity risk around news events, market open
                and close, and low-volume periods.
            </p>
            <p>
                Executive Prime Markets displays and trades the instruments Deriv provides; it doesn&apos;t
                control their prices, and instrument availability is decided by Deriv.
            </p>
        </InfoSection>

        <InfoSection title='No investor compensation scheme'>
            <p>
                {/* TODO: confirm the actual regulatory status/protections that apply to your users' Deriv accounts. */}
                Funds held with Deriv may not be covered by a government deposit insurance or investor
                compensation scheme in the same way a bank account might be. Check Deriv&apos;s own terms
                and regulatory disclosures for what protections, if any, apply to your account.
            </p>
            <p>
                Before depositing, read Deriv&apos;s own terms and regulatory information for your account
                type and location so you understand what protections apply. Executive Prime Markets
                can&apos;t tell you what protections apply to your Deriv account.
            </p>
        </InfoSection>

        <InfoSection title='Executive Prime Markets is a technology provider, not an advisor'>
            <p>
                Executive Prime Markets (EPM) provides software only. Nothing on the site, including any
                &ldquo;quick strategy&rdquo; template, tutorial, or example bot, is financial, investment,
                or trading advice, and no EPM content should be relied on as a recommendation to buy, sell,
                or hold any instrument. Trading decisions, and their outcomes, are entirely your own.
            </p>
            <p>
                If you want personalised advice about whether and how to trade, speak with a licensed
                financial adviser in your country. Nothing in Executive Prime Markets&apos; tutorials or
                templates takes the place of that.
            </p>
        </InfoSection>

        <InfoSection title='Executive Prime Markets does not hold your funds'>
            <p>
                All funds, trades, and account balances are held and executed by Deriv on your own Deriv
                account, not by Executive Prime Markets &mdash; EPM never has access to either. See our{' '}
                <Link to='/about'>About us</Link> and <Link to='/legal/terms'>Terms &amp; conditions</Link>{' '}
                for detail on this relationship.
            </p>
            <p>
                In practice, this means the money at risk when you trade is always in your own Deriv
                account, and Executive Prime Markets cannot recover, refund, or reverse a trade on your
                behalf.
            </p>
        </InfoSection>

        <InfoSection title='Your responsibility to assess suitability'>
            <p>
                Before trading on Executive Prime Markets, consider your own financial situation,
                experience, and risk tolerance. If you are unsure whether trading these instruments is right
                for you, consider seeking independent financial advice before proceeding.
            </p>
            <p>
                Executive Prime Markets doesn&apos;t assess whether trading is suitable for you, and has no
                way to check your finances or experience. Consider how a loss would affect you before you
                start, and stop if trading stops being something you can afford or enjoy.
            </p>
        </InfoSection>
    </InfoPageLayout>
);

export default RiskDisclosurePage;
