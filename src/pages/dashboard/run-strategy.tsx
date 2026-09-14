import { observer } from 'mobx-react-lite';
import TradeAnimation from '@/components/trade-animation';
import FullScreen from '@/components/layout/footer/FullScreen';
import LogoutFooter from '@/components/layout/footer/LogoutFooter';
import NetworkStatus from '@/components/layout/footer/NetworkStatus';
import ServerTime from '@/components/layout/footer/ServerTime';
import { useApiBase } from '@/hooks/useApiBase';

// Account switching and sign-in/sign-up are handled by AppHeader (via
// AccountSwitcher) — this component previously duplicated both with its own
// floating AccountSwitcherModal / "Sign in / Sign up" button, which visually
// collided with the header's own controls. Only the utility icons that have
// no header equivalent (network status, server time, fullscreen, logout)
// remain here.
const RunStrategy = observer(() => {
    const { isAuthorized } = useApiBase();

    return (
        <div className='toolbar__section' data-testid='dt_run_strategy'>
            <div className='toolbar__balance-wrapper'>
                <div className='toolbar__utility-icons'>
                    <NetworkStatus />
                    <ServerTime />
                    <FullScreen />
                    {isAuthorized && <LogoutFooter />}
                </div>
            </div>
            <TradeAnimation className='toolbar__animation' />
        </div>
    );
});
export default RunStrategy;
