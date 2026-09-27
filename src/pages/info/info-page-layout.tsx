// Shared chrome for the standalone info/legal pages (About, Contact, Risk
// Disclosure, Terms, Privacy). These are plain routes (see App.tsx) nested
// inside the same Layout/AppHeader as every other page (Dashboard, Bot
// Builder, Chart, ...) -- so the real nav bar, account switcher, etc. all
// render above this automatically. This component is just the page body:
// eyebrow + title, content (with auto-numbered h2 sections via CSS
// counters), and a small footer cross-linking the other four.
import { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Modal from '@/components/shared_ui/modal';
import { Localize } from '@deriv-com/translations';
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

// One topic block, rendered as a fixed-height card (all cards on a page are
// the same height -- see info-page-layout.scss -- a --featured one is
// deliberately taller for a section that typically carries more content,
// not "as tall as whatever this section's own text needs"). Whatever
// doesn't fit is clipped behind a fade at the card's own bottom edge;
// clicking anywhere on the card (not just a specific button) opens the same
// content in full via a modal -- the same fixed-card + pop-out-modal
// pattern already used for the bot cards on the Trading Bots tab
// (src/pages/epm-trading-bots/freebots/freebots.tsx).
export const InfoSection = ({
    title,
    featured,
    children,
}: {
    title: string;
    featured?: boolean;
    children: ReactNode;
}) => {
    const [isOpen, setIsOpen] = useState(false);

    // A card can contain a real <Link> (e.g. "see our Risk disclosure") --
    // clicking that should navigate, not also pop the modal open behind it.
    const handleCardClick = (event: MouseEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('a')) return;
        setIsOpen(true);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen(true);
        }
    };

    return (
        <>
            <section
                className={`info-page__section${featured ? ' info-page__section--featured' : ''}`}
                onClick={handleCardClick}
                onKeyDown={handleKeyDown}
                role='button'
                tabIndex={0}
                aria-haspopup='dialog'
            >
                <h2>{title}</h2>
                <div className='info-page__section-body'>{children}</div>
                <span className='info-page__section-more'>
                    <Localize i18n_default_text='Read more' />
                </span>
            </section>

            <Modal
                is_open={isOpen}
                toggleModal={() => setIsOpen(false)}
                title={title}
                width='560px'
                className='info-section-details-modal'
                should_header_stick_body={false}
            >
                <Modal.Body className='info-section-details-modal__body'>{children}</Modal.Body>
            </Modal>
        </>
    );
};

export default InfoPageLayout;
