// Shared chrome for the standalone info/legal pages (About, Contact, Risk
// Disclosure, Terms, Privacy). These are plain routes (see App.tsx) nested
// inside the same Layout/AppHeader as every other page, so the real nav bar and
// account switcher render above this automatically. This component is the page
// body: a title, a reading column of sections, a contents rail that follows the
// reader (desktop), and a small footer linking the other pages.
import {
    Children,
    CSSProperties,
    Fragment,
    isValidElement,
    ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import './info-page-layout.scss';

const BRAND_WORDS = ['Executive', 'Prime', 'Markets'];

const FOOTER_LINKS: { to: string; label: string }[] = [
    { to: '/about', label: 'About us' },
    { to: '/contact', label: 'Contact us' },
    { to: '/legal/risk-disclosure', label: 'Risk disclosure' },
    { to: '/legal/terms', label: 'Terms & conditions' },
    { to: '/legal/privacy-policy', label: 'Privacy policy' },
];

type TInfoPageLayout = {
    /** Kept so existing pages still compile; the page category is shown by the footer links. */
    eyebrow?: string;
    title: string;
    /** A --brand-* token from _themes.scss, e.g. 'var(--brand-warning)'. Used for the
     *  page's accent line, links and the contents marker, so each page keeps its own colour. */
    accent: string;
    updated?: string;
    children: ReactNode;
};

const toId = (title: string) =>
    `section-${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}`;

// Finds every <InfoSection> (also inside fragments) so the contents rail can list them.
const collectSectionTitles = (nodes: ReactNode): string[] => {
    const titles: string[] = [];
    Children.forEach(nodes, child => {
        if (!isValidElement(child)) return;
        const props = child.props as { title?: string; children?: ReactNode };
        if (child.type === InfoSection && props.title) titles.push(props.title);
        else if (child.type === Fragment) titles.push(...collectSectionTitles(props.children));
    });
    return titles;
};

const InfoPageLayout = ({ title, accent, updated, children }: TInfoPageLayout) => {
    const { pathname } = useLocation();
    const page_ref = useRef<HTMLDivElement>(null);
    const titles = useMemo(() => collectSectionTitles(children), [children]);
    const [active_id, setActiveId] = useState<string>('');

    // Highlights the section being read, in the contents rail.
    useEffect(() => {
        const root = page_ref.current;
        if (!root || titles.length < 2 || !('IntersectionObserver' in window)) return undefined;
        const sections = Array.from(root.querySelectorAll<HTMLElement>('.info-page__section[id]'));
        const visible = new Set<string>();
        const pick = () => {
            const first = sections.find(section => visible.has(section.id));
            if (first) setActiveId(first.id);
        };
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) visible.add((entry.target as HTMLElement).id);
                    else visible.delete((entry.target as HTMLElement).id);
                });
                pick();
            },
            { root, rootMargin: '-12% 0px -62% 0px', threshold: 0 }
        );
        sections.forEach(section => observer.observe(section));
        setActiveId(sections[0]?.id ?? '');
        return () => observer.disconnect();
    }, [titles, pathname]);

    const goTo = (id: string) => {
        const el = page_ref.current?.querySelector<HTMLElement>(`#${id}`);
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        setActiveId(id);
    };

    return (
        <div className='info-page' ref={page_ref} style={{ '--info-accent': accent } as CSSProperties}>
            <div className='info-page__shell'>
                <header className='info-page__header'>
                    <div className='info-page__brand'>
                        <span className='info-page__logo' aria-hidden='true'>
                            <span className='info-page__logo-img' style={{ backgroundImage: 'url(/logo.png)' }} />
                        </span>
                        <span className='info-page__brand-text'>
                            <span className='info-page__wordmark' role='img' aria-label='Executive Prime Markets'>
                                {BRAND_WORDS.map((word, w) => (
                                    <span className='info-page__word' key={word} aria-hidden='true'>
                                        {word.split('').map((ch, i) => (
                                            <span
                                                key={i}
                                                style={{ '--i': i + w * 4 } as CSSProperties}
                                            >
                                                {ch}
                                            </span>
                                        ))}
                                    </span>
                                ))}
                            </span>
                            <span className='info-page__tagline'>Tools for Deriv traders</span>
                        </span>
                    </div>
                    <h1>{title}</h1>
                    {updated && <p className='info-page__updated'>Last updated {updated}</p>}
                    <span className='info-page__rule' aria-hidden='true' />
                </header>

                <div className='info-page__body'>
                    {titles.length > 1 && (
                        <nav className='info-page__rail' aria-label={title}>
                            <ul>
                                {titles.map(item => {
                                    const id = toId(item);
                                    return (
                                        <li key={id}>
                                            <button
                                                type='button'
                                                className={id === active_id ? 'is-active' : undefined}
                                                aria-current={id === active_id ? 'true' : undefined}
                                                onClick={() => goTo(id)}
                                            >
                                                {item}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>
                    )}
                    <main className='info-page__content'>{children}</main>
                </div>
            </div>

            <footer className='info-page__footer'>
                <nav aria-label='Legal and company'>
                    {FOOTER_LINKS.map(({ to, label }) => (
                        <Link
                            key={to}
                            to={to}
                            className={pathname === to ? 'is-current' : undefined}
                            aria-current={pathname === to ? 'page' : undefined}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </footer>
        </div>
    );
};

/** The one sentence on a page that matters most (a core risk warning, a no-custody
 *  statement), set apart from the paragraphs around it. */
export const Callout = ({ children }: { children: ReactNode }) => <div className='info-page__callout'>{children}</div>;

// One topic of the page: a heading and its text, in full. The contents rail
// (above) links to each of them by the id built from the title.
export const InfoSection = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className='info-page__section' id={toId(title)}>
        <h2>{title}</h2>
        <div className='info-page__section-body'>{children}</div>
    </section>
);

export default InfoPageLayout;
