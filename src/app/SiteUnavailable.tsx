// Shown instead of the app when a domain isn't set up (or is suspended), or when
// the settings lookup failed on a domain that isn't one of the platform's own.
// Deliberately plain and brand-neutral: it never shows the platform's logo,
// name or contact details on someone else's domain.
type TProps = { kind: 'unconfigured' | 'error'; reason?: string };

const SiteUnavailable = ({ kind, reason }: TProps) => {
    const suspended = kind === 'unconfigured' && reason === 'suspended';
    const title =
        kind === 'error'
            ? 'This site is temporarily unavailable'
            : suspended
              ? 'This site is currently unavailable'
              : "This site isn't set up yet";
    const body =
        kind === 'error'
            ? 'Please try again in a few minutes.'
            : suspended
              ? 'The owner of this site has been notified. Please check back later.'
              : 'If you own this domain, finish setting it up from your site owner dashboard.';

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
                color: '#1f2937',
                background: '#f8fafc',
            }}
        >
            <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px' }}>{title}</h1>
            <p style={{ margin: 0, maxWidth: 420, color: '#475569' }}>{body}</p>
        </main>
    );
};

export default SiteUnavailable;
