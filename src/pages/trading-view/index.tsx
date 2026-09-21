import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TradingViewComponent from '@/components/trading-view-chart/trading-view';
import './trading-view-page.scss';

// Full-page version of the same TradingView iframe already used by Bot
// Builder's draggable "TradingView Chart" popup
// (src/components/trading-view-chart/trading-view-modal.tsx) — reuses that
// same underlying component rather than a second, separate integration.
//
// Height is measured directly (viewport height minus wherever this page
// starts) instead of inherited through CSS. The parent chain
// (.dc-tabs__content in a grid row) never resolves to a real height for an
// iframe-only page, so both height: 100% and position: absolute collapsed it
// to zero. A measured pixel height doesn't depend on any ancestor.
// The chart page (charts.deriv.com) is a cross-origin iframe, so its own header
// can't be styled from here. Instead the iframe is rendered at 1/SCALE of the
// size and scaled down, which shrinks the whole thing (header text, height and
// spacing included) to SCALE while still filling the page exactly.
const SCALE = 0.75;

export default function TradingViewPage() {
    const page_ref = useRef<HTMLDivElement | null>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);

    const update = () => {
        const el = page_ref.current;
        if (!el) return;
        // Off-screen background preload sits at a large negative top — treat
        // that as "starts at 0" so it doesn't get an absurd height.
        const top = Math.max(0, el.getBoundingClientRect().top);
        setHeight(Math.max(300, window.innerHeight - top));
    };

    useLayoutEffect(() => {
        update();
    }, []);

    useEffect(() => {
        window.addEventListener('resize', update);
        // Layout above (header, nav) can settle a moment after mount.
        const timers = [setTimeout(update, 100), setTimeout(update, 500)];
        return () => {
            window.removeEventListener('resize', update);
            timers.forEach(clearTimeout);
        };
    }, []);

    return (
        <div className='trading-view-page' ref={page_ref} style={height ? { height: `${height}px` } : undefined}>
            <div
                style={{
                    width: `${100 / SCALE}%`,
                    height: height ? `${height / SCALE}px` : '100%',
                    transform: `scale(${SCALE})`,
                    transformOrigin: 'top left',
                }}
            >
                <TradingViewComponent />
            </div>
        </div>
    );
}
