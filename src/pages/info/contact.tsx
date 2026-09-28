import { Link } from 'react-router-dom';
import { HELP_OPTIONS } from '@/components/get-help';
import InfoPageLayout, { InfoSection } from './info-page-layout';

// TODO: replace with a real support inbox once one exists.
const SUPPORT_EMAIL = 'support@executiveprimemarkets.site';

const ContactPage = () => (
    <InfoPageLayout eyebrow='Company' title='Contact us' accent='var(--brand-info)'>
        <p>
            Have a question about your bots, a trade, or how Executive Prime Markets (EPM) works? Reach the
            EPM team through any of the channels below.
        </p>

        <InfoSection title='Support channels'>
            <p>Pick whichever channel suits you best:</p>
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
            <p>
                All of these channels reach the Executive Prime Markets team. Messages about your Deriv
                account balance, deposits, or withdrawals should go to Deriv instead, because only Deriv can
                act on them.
            </p>
        </InfoSection>

        <InfoSection title='What to include in your message'>
            <p>
                The faster Executive Prime Markets can identify the issue, the faster it can help. Where
                relevant, include:
            </p>
            <ul>
                <li>Your Deriv login ID (never your password)</li>
                <li>The name of the bot or strategy involved, if any</li>
                <li>A screenshot of what you&apos;re seeing, including any error message</li>
                <li>Roughly when the issue happened</li>
            </ul>
            <p>
                The more of this you include, the less back-and-forth it takes to understand what happened.
                Never send your Deriv password or API tokens &mdash; EPM doesn&apos;t need them to help you.
            </p>
        </InfoSection>

        <InfoSection title='Response times'>
            <p>
                {/* TODO: confirm real support hours/SLA before publishing. */}
                Executive Prime Markets aims to respond to support messages within one business day. Live
                chat and call support are fastest for anything urgent, such as a bot behaving unexpectedly
                while it&apos;s running.
            </p>
            <p>
                For anything urgent, stop the bot first from the Bot Builder on Executive Prime Markets, and
                then contact us, so that no further trades are placed while you wait for a reply.
            </p>
        </InfoSection>

        <InfoSection title='Account and funds questions'>
            <p>
                Deposits, withdrawals, and account verification are handled directly by Deriv, not by
                Executive Prime Markets &mdash; see our <Link to='/about'>About us</Link> page for why. For
                those, please contact Deriv support through your Deriv account.
            </p>
            <p>
                Deriv&apos;s support team can see your account, funds, and verification status; Executive
                Prime Markets cannot, because EPM never has access to your funds or your Deriv password.
            </p>
        </InfoSection>

        <InfoSection title='Business and partnership inquiries'>
            <p>
                {/* TODO: add a dedicated inbox for this if it differs from support. */}
                For partnership, affiliate, or press inquiries about Executive Prime Markets, use the email
                above and mention what you&apos;re reaching out about in the subject line.
            </p>
            <p>
                When you write, please include your name, your organisation, and a short description of what
                you&apos;d like to discuss with Executive Prime Markets, so the request can be passed to the
                right person.
            </p>
        </InfoSection>

        <InfoSection title='Report a bug or security issue'>
            <p>
                Found a bug in the Executive Prime Markets bot builder, a broken chart, or anything that
                looks like a security issue? Please report it through the channels above rather than posting
                it publicly, so EPM can look into it before it&apos;s more widely known. Tell us which page
                you were on and the steps that led to the problem, so we can reproduce it.
            </p>
            <p>
                Reports are welcome for anything on Executive Prime Markets itself &mdash; a chart that
                won&apos;t load, a bot that behaves differently from how you built it, or a page that
                displays incorrectly on your phone. Please don&apos;t share your Deriv login details when
                reporting an issue.
            </p>
        </InfoSection>
    </InfoPageLayout>
);

export default ContactPage;
