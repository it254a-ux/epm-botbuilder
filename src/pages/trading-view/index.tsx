import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import TradingViewComponent from '@/components/trading-view-chart/trading-view';
import { useDevice } from '@deriv-com/ui';
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
// can't be restyled from here. What can be done from outside is cropping: the
// iframe is shifted up by CROP_TOP px inside this (overflow: hidden) page, which
// cuts off the tall "deriv" logo strip above the toolbar and gives that height
// back to the chart. Tune CROP_TOP if more/less of the top should be hidden.
const CROP_TOP = 72;

// The Run Panel (see components/run-panel) is a real position:fixed drawer,
// not something that pushes layout on its own -- Chart gets away with this
// because SmartChart is a same-origin component that reads a class name off
// its own wrapper and adjusts its internal canvas margin accordingly (see
// pages/chart/chart.tsx's `dashboard__chart-wrapper--expanded`). That trick
// has no equivalent for a cross-origin iframe: charts.deriv.com has no way to
// know our drawer exists, so without doing this ourselves the drawer simply
// covers the iframe instead of sharing space with it. Reserving real width
// here, on this page's own container, is what actually shrinks the iframe
// (see trading-view.tsx: the iframe is width: 100% of this element) so the
// two sit side by side the same way Chart's chart-and-panel do, rather than
// one floating over the other. Desktop only -- same as Chart, whose
// `--expanded` toggle is also gated on isDesktop; the drawer is a full-width
// bottom sheet on mobile/tablet, not a side panel, so there's nothing to
// share width with there.
const DESKTOP_DRAWER_OPEN_WIDTH = 366;
const DESKTOP_DRAWER_CLOSED_WIDTH = 16; // the toggler sliver, always present

function TradingViewPageComponent() {
    const page_ref = useRef<HTMLDivElement | null>(null);
    const [height, setHeight] = useState<number | undefined>(undefined);
    const { run_panel } = useStore();
    const { isDesktop } = useDevice();
    const { is_drawer_open } = run_panel;

    const reserved_width = isDesktop ? (is_drawer_open ? DESKTOP_DRAWER_OPEN_WIDTH : DESKTOP_DRAWER_CLOSED_WIDTH) : 0;

    const update = () => {
        const el = page_ref.current;
        if (!el) return;
        // Off-screen background preload sits at a large negative top — treat
        // that as "starts at 0" so it doesn't get an absurd height.
        const top = Math.max(0, el.getBoundingClientRect().top);
        // Measure to the bottom of the real content area (.main-body clips
        // everything below it), not the window: anything else in the layout
        // below the body would otherwise push the chart's bottom toolbar out
        // of view.
        const body_el = el.closest('.main-body');
        const bottom = body_el ? body_el.getBoundingClientRect().bottom : window.innerHeight;
        setHeight(Math.max(300, bottom - top));
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
        <div
            className='trading-view-page'
            ref={page_ref}
            style={{
                ...(height ? { height: `${height}px` } : undefined),
                // Same 0.3s ease the drawer itself transitions on
                // (drawer.scss), so both move in step instead of the panel
                // sliding while the chart snaps.
                width: `calc(100% - ${reserved_width}px)`,
                transition: 'width 0.3s ease',
            }}
        >
            <div
                style={{
                    marginTop: `-${CROP_TOP}px`,
                    height: height ? `${height + CROP_TOP}px` : '100%',
                }}
            >
                <TradingViewComponent />
            </div>
        </div>
    );
}

const TradingViewPage = observer(TradingViewPageComponent);
export default TradingViewPage;
