import TradingViewComponent from '@/components/trading-view-chart/trading-view';
import './trading-view-page.scss';

// Full-page version of the same TradingView iframe already used by Bot
// Builder's draggable "TradingView Chart" popup
// (src/components/trading-view-chart/trading-view-modal.tsx) — reuses that
// same underlying component rather than a second, separate integration.
export default function TradingViewPage() {
    return (
        <div className='trading-view-page'>
            <TradingViewComponent />
        </div>
    );
}
