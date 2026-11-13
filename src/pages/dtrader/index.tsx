import { useEffect, useRef } from 'react';
import { attachDtrader, detachDtrader, loadDtrader } from './native-host';

/**
 * Fills the space under the site's tab bar. The height is measured from the screen instead of trusting the
 * parent boxes (inside the home page's Dtrader tab they have no height, which left this page blank).
 */
export default function DtraderPage() {
    const main = useRef<HTMLElement>(null);
    const frame = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = frame.current;
        if (!el) return;
        attachDtrader(el);
        void loadDtrader();
        // lets dtrader-host.css remove the site's side padding so the page touches both walls
        document.body.classList.add('epm-dtrader-active');
        return () => {
            document.body.classList.remove('epm-dtrader-active');
            detachDtrader();
        };
    }, []);

    useEffect(() => {
        const fit = () => {
            const m = main.current;
            if (!m) return;
            const top = m.getBoundingClientRect().top;
            m.style.height = `${Math.max(320, Math.round(window.innerHeight - top))}px`;
        };
        fit();
        const timer = window.setInterval(fit, 700);
        window.addEventListener('resize', fit);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('resize', fit);
        };
    }, []);

    return (
        <main ref={main} className='flex flex-col bg-background overflow-hidden' style={{ minHeight: 320 }}>
            <div ref={frame} className='h-full w-full flex-1' />
        </main>
    );
}
