import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { PLATFORM_CONTACTS, setSiteSettings, socialHref, type TSite } from '@/utils/site-settings';
import DashboardActions from '../dashboard-actions';

const site = (plan: 'free' | 'custom', contacts: Partial<TSite['contacts']> = {}): TSite => ({
    plan,
    powered_by: plan === 'free',
    about: '',
    vision: '',
    mission: '',
    name: 'Operator',
    primary_color: '#000000',
    font: '',
    logo_url: '',
    contacts: { whatsapp: '', phone: '', email: '', telegram: '', ...contacts },
});

describe('DashboardActions', () => {
    afterEach(() => setSiteSettings({ kind: 'platform' }));

    test('on the platform: WhatsApp, Call, Text, TikTok, Instagram and Facebook, with the right links', () => {
        setSiteSettings({ kind: 'platform' });
        render(<DashboardActions />);
        const hrefs = (label: string) => screen.getByLabelText(label).getAttribute('href');
        expect(hrefs('WhatsApp')).toBe(`https://wa.me/${PLATFORM_CONTACTS.whatsapp}`);
        expect(hrefs('Call')).toBe(`tel:${PLATFORM_CONTACTS.phone}`);
        expect(hrefs('Text message')).toBe(`sms:${PLATFORM_CONTACTS.phone}`);
        expect(hrefs('TikTok')).toBe('https://www.tiktok.com/@akyidafx');
        expect(hrefs('Instagram')).toBe('https://www.instagram.com/akyidafx');
        expect(hrefs('Facebook')).toBe('https://www.facebook.com/kenyanharmonize');
        expect(screen.getAllByRole('link')).toHaveLength(6);
    });

    test('pages open in a new tab safely; Call and Text do not open a tab', () => {
        render(<DashboardActions />);
        for (const label of ['WhatsApp', 'TikTok', 'Instagram', 'Facebook']) {
            const a = screen.getByLabelText(label);
            expect(a.getAttribute('target')).toBe('_blank');
            expect(a.getAttribute('rel')).toBe('noopener noreferrer');
        }
        for (const label of ['Call', 'Text message']) expect(screen.getByLabelText(label).getAttribute('target')).toBeNull();
    });

    test('every button has a name for screen readers and a tooltip, and the icon itself is hidden from them', () => {
        const { container } = render(<DashboardActions />);
        for (const a of screen.getAllByRole('link')) {
            expect(a.getAttribute('aria-label')).toBeTruthy();
            expect(a.getAttribute('title')).toBe(a.getAttribute('aria-label'));
        }
        container.querySelectorAll('svg').forEach(svg => expect(svg.getAttribute('aria-hidden')).toBe('true'));
    });

    test('free operator sites show the platform contacts and socials', () => {
        setSiteSettings({ kind: 'site', site: site('free') });
        render(<DashboardActions />);
        expect(screen.getAllByRole('link')).toHaveLength(6);
    });

    test('a custom-domain operator sees only their own contacts and never your social pages', () => {
        setSiteSettings({ kind: 'site', site: site('custom', { whatsapp: '15551234567' }) });
        render(<DashboardActions />);
        expect(screen.getAllByRole('link')).toHaveLength(1);
        expect(screen.getByLabelText('WhatsApp').getAttribute('href')).toBe('https://wa.me/15551234567');
        expect(screen.queryByLabelText('TikTok')).toBeNull();
        expect(screen.queryByLabelText('Instagram')).toBeNull();
        expect(screen.queryByLabelText('Facebook')).toBeNull();
        expect(document.body.innerHTML).not.toContain(PLATFORM_CONTACTS.whatsapp);
    });

    test('a custom-domain operator with no contacts gets no buttons at all', () => {
        setSiteSettings({ kind: 'site', site: site('custom') });
        const { container } = render(<DashboardActions />);
        expect(container.firstChild).toBeNull();
    });

    test('an invalid operator number never becomes a link', () => {
        setSiteSettings({ kind: 'site', site: site('custom', { whatsapp: 'javascript:alert(1)', phone: 'abc' }) });
        const { container } = render(<DashboardActions />);
        expect(container.firstChild).toBeNull();
    });

    test('each button starts its loop a little later than the last, so they move like a wave', () => {
        render(<DashboardActions />);
        const delays = screen.getAllByRole('link').map(a => (a as HTMLElement).style.animationDelay);
        expect(new Set(delays).size).toBe(6);
        expect(delays[0]).toBe('0s');
    });
});

describe('socialHref', () => {
    test('accepts only https links to the three networks', () => {
        expect(socialHref('https://www.tiktok.com/@akyidafx')).toBe('https://www.tiktok.com/@akyidafx');
        expect(socialHref('https://www.instagram.com/akyidafx')).toBe('https://www.instagram.com/akyidafx');
        expect(socialHref('https://facebook.com/kenyanharmonize')).toBe('https://facebook.com/kenyanharmonize');
        for (const bad of ['http://www.tiktok.com/@a', 'javascript:alert(1)', 'https://evil.com/tiktok.com/@a', 'https://www.tiktok.com.evil.com/@a', 'https://www.twitter.com/a', 'https://www.tiktok.com/@a b', '', 'https://www.tiktok.com/@a?x=1&y=2']) {
            expect(socialHref(bad)).toBe('');
        }
    });
});

describe('the animation', () => {
    const css = fs.readFileSync(path.join(__dirname, '../dashboard-actions.scss'), 'utf8');

    test('floats and pulses forever, never stopping or resetting', () => {
        expect(css).toMatch(/animation: db-actions-float [^;]*infinite alternate/); // alternate = goes back the same way, no jump
        expect(css).toMatch(/animation: db-actions-ring [^;]*infinite/);
        expect(css).not.toMatch(/animation-iteration-count:\s*\d/);
    });
    test('buttons never fade away at any point of the loop', () => {
        const floatBlock = /@keyframes db-actions-float\s*{([\s\S]*?)\n}\n/.exec(css)![1];
        expect(floatBlock).not.toMatch(/opacity/);
    });
    test('people who asked for less motion get still but visible buttons', () => {
        expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
    });
});
