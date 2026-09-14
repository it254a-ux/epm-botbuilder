import { observer } from 'mobx-react-lite';
import TradeAnimation from '@/components/trade-animation';
import NetworkStatus from '@/components/layout/footer/NetworkStatus';

// Account switching and sign-in/sign-up are handled by AppHeader (via
// AccountSwitcher) — this component previously duplicated both with its own
// floating AccountSwitcherModal / "Sign in / Sign up" button, which visually
// collided with the header's own controls.
//
// Server time, fullscreen, and logout have since moved into the header's own
// nav row (see menu-items.tsx) alongside the new theme toggle. Only network
// status — which has no header equivalent — remains here.
const RunStrategy = observer(() => {
    return (
        <div className='toolbar__section' data-testid='dt_run_strategy'>
            <div className='toolbar__balance-wrapper'>
                <div className='toolbar__utility-icons'>
                    <NetworkStatus />
                </div>
            </div>
            <TradeAnimation className='toolbar__animation' />
        </div>
    );
});
export default RunStrategy;
