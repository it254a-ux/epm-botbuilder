import React from 'react';
import { getSiteContacts, getSiteSocials, phoneHref, smsHref, socialHref, whatsappHref } from '@/utils/site-settings';
import './dashboard-actions.scss';

type TAction = { key: string; label: string; href: string; external: boolean; icon: React.ReactNode };

const svg = (children: React.ReactNode, fill = false) => (
    <svg viewBox='0 0 24 24' width='26' height='26' aria-hidden='true' focusable='false' fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth='1.9' strokeLinecap='round' strokeLinejoin='round'>
        {children}
    </svg>
);

const ICONS = {
    tiktok: svg(<path d='M16.5 3c.3 2.2 1.7 3.9 4 4.1v3.2c-1.5 0-2.9-.5-4-1.3v6.2c0 3.2-2.6 5.8-5.8 5.8S5 18.4 5 15.2s2.6-5.8 5.8-5.8c.3 0 .6 0 .9.1v3.3c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.6s1.1 2.6 2.5 2.6 2.6-1.2 2.6-2.6V3h3.1z' />, true),
    instagram: svg(
        <>
            <rect x='3.5' y='3.5' width='17' height='17' rx='5' />
            <circle cx='12' cy='12' r='4' />
            <circle cx='17.2' cy='6.8' r='0.6' fill='currentColor' />
        </>
    ),
    facebook: svg(<path d='M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H6v4h3v7h4v-7h3l1-4h-4V9c0-.6.4-1 1-1z' />, true),
    whatsapp: svg(
        <>
            <path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z' />
            <path d='M9 8.6c0 3.4 3 6.4 6.4 6.4l1-1.6-2.2-1-.9.9c-1-.4-2-1.4-2.4-2.4l.9-.9-1-2.2z' />
        </>
    ),
    call: svg(<path d='M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z' />, true),
    text: svg(<path d='M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z' />, true),
};

/**
 * Quick contact and social buttons for the Dashboard. They gently float and glow in a loop that never stops or resets
 * (the animation lives in dashboard-actions.scss and is switched off for people who asked their device for less motion).
 * Numbers and links come from the site settings, and a button with no valid link is simply not shown.
 */
const DashboardActions = () => {
    const contacts = getSiteContacts();
    const socials = getSiteSocials();
    const actions: TAction[] = [
        { key: 'whatsapp', label: 'WhatsApp', href: whatsappHref(contacts.whatsapp), external: true, icon: ICONS.whatsapp },
        { key: 'call', label: 'Call', href: phoneHref(contacts.phone), external: false, icon: ICONS.call },
        { key: 'text', label: 'Text message', href: smsHref(contacts.phone), external: false, icon: ICONS.text },
        { key: 'tiktok', label: 'TikTok', href: socialHref(socials.tiktok), external: true, icon: ICONS.tiktok },
        { key: 'instagram', label: 'Instagram', href: socialHref(socials.instagram), external: true, icon: ICONS.instagram },
        { key: 'facebook', label: 'Facebook', href: socialHref(socials.facebook), external: true, icon: ICONS.facebook },
    ].filter(a => a.href);
    if (!actions.length) return null;

    return (
        <nav className='db-actions' aria-label='Contact and social links'>
            {actions.map((a, i) => (
                <a
                    key={a.key}
                    className={`db-actions__btn db-actions__btn--${a.key}`}
                    style={{ animationDelay: `${i * 0.35}s`, ['--db-delay' as string]: `${i * 0.35}s` }}
                    href={a.href}
                    title={a.label}
                    aria-label={a.label}
                    {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                    {a.icon}
                </a>
            ))}
        </nav>
    );
};

export default DashboardActions;
