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

        <h2>Support channels</h2>
        <ul>
            {HELP_OPTIONS.map(option => (
                <li key={option.key}>
                    <a href={option.href} target={option.external ? '_blank' : undefined} rel='noopener noreferrer'>
                        {option.label}
                    </a>
                </li>
            ))}
            <li>
                Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </li>
        </ul>

        <h2>Account and funds questions</h2>
        <p>
            Deposits, withdrawals, and account verification are handled directly by Deriv, not by us &mdash;
            see our <Link to='/about'>About us</Link> page for why. For those, please contact Deriv support
            through your Deriv account.
        </p>
    </InfoPageLayout>
);

export default ContactPage;
