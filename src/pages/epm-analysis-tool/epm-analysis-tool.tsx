import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import './epm-analysis-tool.scss';

// Same measured-height approach as the TradingView page
// (src/pages/trading-view/index.tsx) and for the same reason: this tab's
// content is an iframe, and the parent grid cell (.dc-tabs__content) never
// resolves a real height for an iframe-only page, so height: 100% collapses
// to zero. Unlike TradingView, the iframe here is same-origin
// (/epm-analysis-tool.html, served from this app's own public/ folder), so
// there's no cross-origin crop to apply -- just the height measurement and
// the same Run Panel drawer width reservation Chart/TradingView use.
const DESKTOP_DRAWER_OPEN_WIDTH = 366;
const DESKTOP_DRAWER_CLOSED_WIDTH = 16; // the toggler sliver, always present

function EpmAnalysisToolPageComponent() {
    const page_ref = useRef<HTMLDivElement | null>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);
    const { run_panel } = useStore();
    const { isDesktop } = useDevice();
    const { is_drawer_open } = run_panel;

    const reserved_width = isDesktop ? (is_drawer_open ? DESKTOP_DRAWER_OPEN_WIDTH : DESKTOP_DRAWER_CLOSED_WIDTH) : 0;

    const update = () => {
        const el = page_ref.current;
        if (!el) return;
        const top = Math.max(0, el.getBoundingClientRect().top);
        const body_el = el.closest('.main-body');
        const bottom = body_el ? body_el.getBoundingClientRect().bottom : window.innerHeight;
        setHeight(Math.max(300, bottom - top));
    };

    useLayoutEffect(() => {
        update();
    }, []);

    useEffect(() => {
        window.addEventListener('resize', update);
        const timers = [setTimeout(update, 100), setTimeout(update, 500)];
        return () => {
            window.removeEventListener('resize', update);
            timers.forEach(clearTimeout);
        };
    }, []);

    return (
        <div
            className='epm-analysis-tool-page'
            ref={page_ref}
            style={{
                ...(height ? { height: `${height}px` } : undefined),
                width: `calc(100% - ${reserved_width}px)`,
                transition: 'width 0.3s ease',
            }}
        >
            <iframe
                src='/epm-analysis-tool.html'
                title='EPM Analysis Tool'
                className='epm-analysis-tool-page__frame'
                allow='clipboard-write'
            />
        </div>
    );
}

const EpmAnalysisToolPage = observer(EpmAnalysisToolPageComponent);
export default EpmAnalysisToolPage;
