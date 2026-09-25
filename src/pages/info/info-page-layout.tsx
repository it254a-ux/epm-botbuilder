// Shared chrome for the standalone info/legal pages (About, Contact, Risk
// Disclosure, Terms, Privacy). These are plain routes (see App.tsx), not
// DBOT_TABS tabs -- there's no trading dashboard state to preserve, so they
// render outside the app's tab/Layout system entirely, with just enough of
// their own header/footer to feel like part of the same product.
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppLogo } from '@/components/layout/app-logo';
import './info-page-layout.scss';

const FOOTER_LINKS: { to: string; label: string }[] = [
    { to: '/about', label: 'About us' },
    { to: '/contact', label: 'Contact us' },
    { to: '/legal/risk-disclosure', label: 'Risk disclosure' },
    { to: '/legal/terms', label: 'Terms & conditions' },
    { to: '/legal/privacy-policy', label: 'Privacy policy' },
];

type TInfoPageLayout = {
    title: string;
    updated?: string;
    children: ReactNode;
};

const InfoPageLayout = ({ title, updated, children }: TInfoPageLayout) => {
    return (
        <div className='info-page'>
            <header className='info-page__header'>
                <AppLogo />
                <Link className='info-page__back' to='/'>
                    &larr; Back to app
                </Link>
            </header>

            <main className='info-page__content'>
                <h1>{title}</h1>
                {updated && <p className='info-page__updated'>Last updated: {updated}</p>}
                {children}
            </main>

            <footer className='info-page__footer'>
                <nav aria-label='Legal and company'>
                    {FOOTER_LINKS.map(({ to, label }, index) => (
                        <span key={to}>
                            <Link to={to}>{label}</Link>
                            {index < FOOTER_LINKS.length - 1 && <span aria-hidden='true'> · </span>}
                        </span>
                    ))}
                </nav>
            </footer>
        </div>
    );
};

export default InfoPageLayout;
