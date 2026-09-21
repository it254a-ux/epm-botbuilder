import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import './get-help.scss';

// ── Configure your real contact destinations here ──────────────────────────
const WHATSAPP_NUMBER = '254115533208'; // digits only, country code, no + or spaces
const WHATSAPP_MESSAGE = 'Hi, I need help with EPM Bot Builder';
const PHONE_NUMBER = '+254115533208';
// "Message" opens the native SMS composer (sms:), matching the original
// contact button's behavior in the parent app — not email or live chat.
const MESSAGE_HREF = `sms:${PHONE_NUMBER}`;
// ─────────────────────────────────────────────────────────────────────────

const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
const PHONE_HREF = `tel:${PHONE_NUMBER}`;

const WhatsAppIcon = () => (
    <svg viewBox='0 0 24 24' width='11' height='11' fill='currentColor' aria-hidden='true'>
        <path d='M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0 0 12.04 2Zm0 1.8a8.1 8.1 0 0 1 8.11 8.11c0 4.48-3.64 8.12-8.12 8.12a8.06 8.06 0 0 1-4.13-1.14l-.3-.17-3.14.82.84-3.06-.19-.32a8.06 8.06 0 0 1-1.24-4.28c0-4.48 3.65-8.08 8.17-8.08Zm-4.42 4.6c-.15 0-.4.06-.61.3-.21.24-.8.79-.8 1.92s.82 2.23.94 2.38c.11.15 1.61 2.53 3.98 3.44 1.97.76 2.37.61 2.8.57.43-.04 1.38-.56 1.57-1.11.2-.54.2-1 .14-1.1-.06-.1-.22-.15-.46-.27-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.55.12-.16.24-.63.78-.77.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.44-1.34-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.36-.76-1.86-.2-.48-.4-.42-.55-.42Z' />
    </svg>
);

const MessageIcon = () => (
    <svg viewBox='0 0 24 24' width='11' height='11' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden='true'>
        <path
            d='M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.16 0-2.26-.24-3.26-.68L3 21l1.68-4.24A8.5 8.5 0 1 1 21 11.5Z'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
    </svg>
);

const PhoneIcon = () => (
    <svg viewBox='0 0 24 24' width='10' height='10' fill='currentColor' aria-hidden='true'>
        <path d='M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z' />
    </svg>
);

const HelpIcon = () => (
    <svg viewBox='0 0 24 24' width='12' height='12' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden='true'>
        <path d='M9.5 9a2.5 2.5 0 1 1 3.6 2.24c-.86.43-1.6 1.1-1.6 2.16v.35' strokeLinecap='round' strokeLinejoin='round' />
        <circle cx='12' cy='17.5' r='0.9' fill='currentColor' stroke='none' />
        <circle cx='12' cy='12' r='9.25' strokeLinecap='round' />
    </svg>
);

const CloseIcon = () => (
    <svg viewBox='0 0 24 24' width='11' height='11' fill='none' stroke='currentColor' strokeWidth='2.4' aria-hidden='true'>
        <path d='M6 6l12 12M18 6L6 18' strokeLinecap='round' />
    </svg>
);

type TContactOption = {
    key: string;
    label: string;
    href: string;
    icon: JSX.Element;
    className: string;
    external?: boolean;
};

const OPTIONS: TContactOption[] = [
    { key: 'whatsapp', label: 'WhatsApp', href: WHATSAPP_HREF, icon: <WhatsAppIcon />, className: 'get-help__option--whatsapp', external: true },
    { key: 'message', label: 'Message', href: MESSAGE_HREF, icon: <MessageIcon />, className: 'get-help__option--message' },
    { key: 'phone', label: 'Call', href: PHONE_HREF, icon: <PhoneIcon />, className: 'get-help__option--phone' },
];

// Reused by the desktop header's "More" menu (menu-items.tsx), which shows
// the same contact options instead of the floating button on desktop.
export const HELP_OPTIONS = OPTIONS;

const GetHelpWidget = () => {
    const [is_open, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!is_open) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [is_open]);

    return (
        <div className={clsx('get-help', { 'get-help--open': is_open })} ref={rootRef}>
            <div className='get-help__options' aria-hidden={!is_open}>
                {OPTIONS.map((option, index) => (
                    <a
                        key={option.key}
                        href={option.href}
                        target={option.external ? '_blank' : undefined}
                        rel={option.external ? 'noopener noreferrer' : undefined}
                        className={clsx('get-help__option', option.className)}
                        style={{ transitionDelay: is_open ? `${index * 45}ms` : '0ms' }}
                        tabIndex={is_open ? 0 : -1}
                    >
                        <span className='get-help__option-icon'>{option.icon}</span>
                        <span className='get-help__option-label'>{option.label}</span>
                    </a>
                ))}
            </div>

            <button
                type='button'
                className='get-help__trigger'
                onClick={() => setIsOpen(prev => !prev)}
                aria-expanded={is_open}
                aria-label={is_open ? 'Close help menu' : 'Get help'}
            >
                <span className='get-help__trigger-icon get-help__trigger-icon--help'>
                    <HelpIcon />
                </span>
                <span className='get-help__trigger-icon get-help__trigger-icon--close'>
                    <CloseIcon />
                </span>
                <span className='get-help__trigger-label'>Get Help</span>
            </button>
        </div>
    );
};

export default GetHelpWidget;
