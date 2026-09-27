import { Link } from 'react-router-dom';
import { HELP_OPTIONS } from '@/components/get-help';
import InfoPageLayout from './info-page-layout';

// TODO: replace with a real support inbox once one exists.
const SUPPORT_EMAIL = 'support@executiveprimemarkets.site';

const ContactPage = () => (
    <InfoPageLayout eyebrow='Company' title='Contact us' accent='var(--brand-info)'>
        <p>
            Have a question about your bots, a trade, or your account? Reach us through any of the channels
            below.
        </p>

        <section className='info-page__section'>
            <h2>Support channels</h2>
            <ul>
                {HELP_OPTIONS.map(option => (
                    <li key={option.key}>
                        <a
                            href={option.href}
                            target={option.external ? '_blank' : undefined}
                            rel='noopener noreferrer'
                        >
                            {option.label}
                        </a>
                    </li>
                ))}
                <li>
                    Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                </li>
            </ul>
        </section>

        <section className='info-page__section'>
            <h2>What to include in your message</h2>
            <p>The faster we can identify the issue, the faster we can help. Where relevant, include:</p>
            <ul>
                <li>Your Deriv login ID (never your password)</li>
                <li>The name of the bot or strategy involved, if any</li>
                <li>A screenshot of what you&apos;re seeing, including any error message</li>
                <li>Roughly when the issue happened</li>
            </ul>
        </section>

        <section className='info-page__section'>
            <h2>Response times</h2>
            <p>
                {/* TODO: confirm real support hours/SLA before publishing. */}
                We aim to respond to support messages within one business day. Live chat and call support
                are fastest for anything urgent, such as a bot behaving unexpectedly while it&apos;s running.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Account and funds questions</h2>
            <p>
                Deposits, withdrawals, and account verification are handled directly by Deriv, not by us
                &mdash; see our <Link to='/about'>About us</Link> page for why. For those, please contact
                Deriv support through your Deriv account.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Business and partnership inquiries</h2>
            <p>
                {/* TODO: add a dedicated inbox for this if it differs from support. */}
                For partnership, affiliate, or press inquiries, use the email above and mention what you&apos;re
                reaching out about in the subject line.
            </p>
        </section>

        <section className='info-page__section'>
            <h2>Report a bug or security issue</h2>
            <p>
                Found a bug in the bot builder, a broken chart, or anything that looks like a security
                issue? Please report it through the channels above rather than posting it publicly, so we
                can look into it before it&apos;s more widely known.
            </p>
        </section>
    </InfoPageLayout>
);

export default ContactPage;
