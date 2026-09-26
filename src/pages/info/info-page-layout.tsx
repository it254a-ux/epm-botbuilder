// Shared chrome for the standalone info/legal pages (About, Contact, Risk
// Disclosure, Terms, Privacy). These are plain routes (see App.tsx) nested
// inside the same Layout/AppHeader as every other page (Dashboard, Bot
// Builder, Chart, ...) -- so the real nav bar, account switcher, etc. all
// render above this automatically. This component is just the page body:
// eyebrow + title, content (with auto-numbered h2 sections via CSS
// counters), and a small footer cross-linking the other four.
import { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './info-page-layout.scss';

const FOOTER_LINKS: { to: string; label: string }[] = [
    { to: '/about', label: 'About us' },
    { to: '/contact', label: 'Contact us' },
    { to: '/legal/risk-disclosure', label: 'Risk disclosure' },
    { to: '/legal/terms', label: 'Terms & conditions' },
    { to: '/legal/privacy-policy', label: 'Privacy policy' },
];

type TInfoPageLayout = {
    eyebrow: string;
    title: string;
    /** A --brand-* token from _themes.scss, e.g. 'var(--brand-warning)' -- keeps
     *  each page's accent drawn from the app's existing palette rather than a
     *  one-off color, so pages feel distinct without feeling inconsistent. */
    accent: string;
    updated?: string;
    children: ReactNode;
};

const InfoPageLayout = ({ eyebrow, title, accent, updated, children }: TInfoPageLayout) => {
    const { pathname } = useLocation();

    return (
        <div className='info-page' style={{ '--info-accent': accent } as CSSProperties}>
            <main className='info-page__content'>
                <div className='info-page__eyebrow'>{eyebrow}</div>
                <h1>{title}</h1>
                {updated && <div className='info-page__updated'>Last updated: {updated}</div>}
                {children}
            </main>

            <footer className='info-page__footer'>
                <nav aria-label='Legal and company'>
                    {FOOTER_LINKS.map(({ to, label }) => (
                        <Link key={to} to={to} className={pathname === to ? 'is-current' : undefined}>
                            {label}
                        </Link>
                    ))}
                </nav>
            </footer>
        </div>
    );
};

/** A visually-elevated box for the one sentence on a page that matters most
 *  (a core risk warning, a no-custody statement) -- pulls it out of the
 *  regular paragraph flow instead of leaning on <strong> alone. */
export const Callout = ({ children }: { children: ReactNode }) => <div className='info-page__callout'>{children}</div>;

export default InfoPageLayout;
